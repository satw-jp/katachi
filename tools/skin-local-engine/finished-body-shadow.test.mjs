import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FINISHED_BODY_GRID_MEDIA_TYPE,
  FINISHED_BODY_RESULT_MEDIA_TYPE,
  FINISHED_BODY_SNAPSHOT_MEDIA_TYPE,
  encodeFinishedBodyGridRequest,
  encodeFinishedBodySnapshot,
  validateFinishedBodySnapshotEnvelope,
} from "./finished-body-shadow-transport.mjs";
import { FINISHED_BODY_SDF_ALGORITHM, createLocalEngineServer } from "./server.mjs";

const ORIGIN = "https://katachi.a-8c3.workers.dev";
const PROJECT = `sha256:${"12".repeat(32)}`;
const encoded = encodeFinishedBodySnapshot({
  contract: "katachi.skin.finished-body-field-snapshot.v1",
  version: 1,
  mode: "plate",
  coinBulge: 0,
  coinBulgeBalance: 0,
  quadMeshJoinWidth: 0,
  coordinateContract: { frame: "object", unitsPerMillimeter: 0.1, handedness: "right", buildAxis: "+z" },
  hostK: 0.1,
  roundK: 0.05,
  thickness: 0.2,
  capsuleBlend: 0.03,
  host: [{ x: 0, y: 0, z: 0, r: 1 }],
  flatPoints: [{ x: 1, y: 0, z: 0, r: 0.2 }],
  raisedPoints: [],
  capsules: [{ start: { x: -0.5, y: 0, z: 0 }, end: { x: 0.5, y: 0, z: 0 }, radius: 0.04 }],
});

test("Finished BODY snapshot fingerprint is stable and tamper-evident", () => {
  const envelope = validateFinishedBodySnapshotEnvelope(encoded.payload);
  assert.equal(envelope.geometryFingerprintText, encoded.geometryFingerprint);
  const tampered = Buffer.from(encoded.payload);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => validateFinishedBodySnapshotEnvelope(tampered), /fingerprint mismatch/);
});

test("lab helper binds volatile Finished BODY session and keeps result shadow-only", async (context) => {
  const resultPayload = Buffer.alloc(164);
  resultPayload.write("KFR1", 0, "ascii");
  resultPayload.writeUInt16LE(1, 4);
  resultPayload.writeUInt16LE(2, 6);
  resultPayload.writeUInt32LE(160, 8);
  encoded.fingerprint.copy(resultPayload, 16);
  resultPayload.writeUInt32LE(1, 48);
  resultPayload.writeUInt32LE(160, 52);
  resultPayload.writeUInt32LE(164, 56);
  resultPayload.writeUInt32LE(1, 112);
  resultPayload.writeUInt32LE(1, 116);
  resultPayload.writeUInt32LE(1, 120);
  resultPayload.writeFloatLE(-0.1, 160);
  const finishedBodyWorker = {
    async uploadSnapshot() {
      return {
        nativeDecodeMilliseconds: 0.1, bufferPreparationMilliseconds: 0.1,
        hostToDeviceMilliseconds: 0.2, nativeTotalMilliseconds: 0.4,
        workerStartupMilliseconds: 1, workerInitializationMilliseconds: 1,
        workerRoundTripMilliseconds: 2, workerPid: 42, deviceName: "NVIDIA GeForce RTX 3080",
        shadow: true, productionApplied: false,
      };
    },
    async evaluateGrid() {
      return {
        payload: resultPayload,
        timing: { kernelMilliseconds: 0.01, deviceToHostMilliseconds: 0.02, workerRoundTripMilliseconds: 0.5 },
        shadow: true, productionApplied: false,
      };
    },
    async close() {},
  };
  const probe = {
    compiledExecutable: { available: true, artifactSha256: "A".repeat(64), capabilities: {
      engineVersion: "test", device: { name: "NVIDIA GeForce RTX 3080" }, precisionMode: "float32",
    } },
    cudaBackend: { available: true },
  };
  const server = createLocalEngineServer({
    probe,
    expectedHostHeader: null,
    persistentWorker: { async close() {} },
    finishedBodyWorker,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const common = {
    Origin: ORIGIN,
    "X-Katachi-Geometry-Prototype": "shadow-only-v1",
    "X-Katachi-Project-Fingerprint": PROJECT,
    "X-Katachi-Algorithm-Contract": FINISHED_BODY_SDF_ALGORITHM,
  };
  const uploaded = await fetch(`http://127.0.0.1:${port}/v1/lab/finished-body-sessions`, {
    method: "POST",
    headers: { ...common, "Content-Type": FINISHED_BODY_SNAPSHOT_MEDIA_TYPE },
    body: encoded.payload,
  });
  assert.equal(uploaded.status, 201);
  const session = await uploaded.json();
  assert.equal(session.shadow, true);
  assert.equal(session.productionApplied, false);
  assert.equal(session.volatile, true);
  const grid = encodeFinishedBodyGridRequest(encoded.fingerprint, {
    bounds: { min: { x: 0, y: 0, z: 0 } },
    shape: { nx: 0, ny: 0, nz: 0, step: 0.1 },
  });
  const evaluated = await fetch(`http://127.0.0.1:${port}/v1/lab/finished-body-sessions/${session.sessionId}/evaluate-grid`, {
    method: "POST",
    headers: { ...common, "Content-Type": FINISHED_BODY_GRID_MEDIA_TYPE, "X-Katachi-Shadow-Session-Id": session.sessionId },
    body: grid.payload,
  });
  assert.equal(evaluated.status, 200);
  assert.equal(evaluated.headers.get("content-type"), FINISHED_BODY_RESULT_MEDIA_TYPE);
  assert.equal(evaluated.headers.get("x-katachi-shadow"), "true");
  assert.equal(evaluated.headers.get("x-katachi-production-applied"), "false");
  assert.equal(evaluated.headers.get("x-katachi-session-cache-hit"), "true");
  const stale = await fetch(`http://127.0.0.1:${port}/v1/lab/finished-body-sessions/${session.sessionId}/evaluate-grid`, {
    method: "POST",
    headers: { ...common, "Content-Type": FINISHED_BODY_GRID_MEDIA_TYPE,
      "X-Katachi-Shadow-Session-Id": session.sessionId, "X-Katachi-Project-Fingerprint": `sha256:${"34".repeat(32)}` },
    body: grid.payload,
  });
  assert.equal(stale.status, 409);
});

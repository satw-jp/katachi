import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  HIKARI_MITSUBA_OPERATION,
  HikariMitsubaBridgeError,
  HikariMitsubaClient,
  parseCapabilities,
  validateRenderRequest,
  type HikariMitsubaRequest,
} from "./client.ts";

const artifact = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const artifactHash = createHash("sha256").update(artifact).digest("hex");
const fingerprint = "b".repeat(64);

function request(id = "client-test"): HikariMitsubaRequest {
  return {
    requestId: id,
    operation: HIKARI_MITSUBA_OPERATION,
    case: { id: "fixed-case" },
    provenance: {
      repository: "satw-jp/katachi",
      sourceCommit: "586a20cedfca9e769f710cfd96a400b4737069d5",
      sourceRef: "main",
      shapeSource: "cloud-sculpt.buildCloudMesh",
      fingerprint,
    },
    canonicalMesh: { format: "obj", dataBase64: "dHJpYW5nbGU=", byteLength: 8, sha256: "a".repeat(64) },
    physicalScale: { mmPerShapeUnit: 20, source: "assumed" },
    camera: {
      positionMm: { x: 0, y: 80, z: -120 },
      targetMm: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fovDeg: 45,
      aspect: 1,
    },
    hostMaterial: { id: "neutral", ior: 1.5, absorptionPerMm: { r: 0.002, g: 0.002, b: 0.002 }, roughness: 0.05 },
    light: { directionPropagation: { x: 0, y: -1, z: 0 }, radiance: { r: 1, g: 1, b: 1 }, angularDiameterDeg: 5 },
    receiver: { positionMm: { x: 0, y: -40, z: 0 }, normal: { x: 0, y: 1, z: 0 }, extentMm: { x: 120, z: 120 }, reflectance: 0.8 },
    environment: { radiance: { r: 0.01, g: 0.01, b: 0.01 } },
    renderPurpose: "body",
    compute: { device: "cpu" },
    spp: 2,
    resolution: { width: 16, height: 16 },
  };
}

function capabilities() {
  return {
    schemaVersion: "hikari-mitsuba-bridge.v1",
    service: "hikari-mitsuba-local-bridge",
    bindAddress: "127.0.0.1",
    port: 47659,
    mitsuba: { available: true, version: "3.9.1" },
    drjit: { available: true, version: "1.5.0" },
    pythonVersion: "3.12.13",
    variants: ["scalar_rgb", "cuda_ad_rgb"],
    selectedVariant: "scalar_rgb",
    cudaAvailable: false,
    gpu: null,
    workerReady: true,
    supportedOperations: [HIKARI_MITSUBA_OPERATION],
    supportedDevices: ["cuda", "cpu"],
    optix: "unknown",
    artifactTransport: "GET /v1/artifacts/{requestId}",
    cancellation: "POST /v1/cancel",
  };
}

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function metadata(forRequest: HikariMitsubaRequest, changes: Record<string, unknown> = {}) {
  return {
    requestId: forRequest.requestId,
    success: true,
    operation: HIKARI_MITSUBA_OPERATION,
    selectedVariant: "scalar_rgb",
    gpu: null,
    executionDevice: "cpu",
    cudaFallback: false,
    purpose: forRequest.renderPurpose,
    resolution: forRequest.resolution,
    spp: forRequest.spp,
    renderMs: 2.5,
    artifactHash,
    artifactByteLength: artifact.byteLength,
    artifactUrl: `/v1/artifacts/${forRequest.requestId}`,
    provenanceHash: "c".repeat(64),
    provenanceFingerprint: forRequest.provenance.fingerprint,
    warnings: [],
    ...changes,
  };
}

test("capability parser accepts the fixed local schema and rejects another service", () => {
  assert.equal(parseCapabilities(capabilities()).port, 47659);
  assert.throws(() => parseCapabilities({ ...capabilities(), service: "other" }), HikariMitsubaBridgeError);
});

test("client validates response provenance and downloads a bounded binary artifact", async () => {
  const original = request();
  const calls: string[] = [];
  const client = new HikariMitsubaClient({
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/v1/render")) return responseJson(metadata(original));
      if (url.includes("/v1/artifacts/")) return new Response(artifact, { headers: { "Content-Type": "image/png" } });
      throw new Error(`unexpected ${url}`);
    },
  });
  const result = await client.render(original);
  assert.deepEqual([...result.artifact], [...artifact]);
  assert.equal(result.metadata.provenanceFingerprint, fingerprint);
  assert.equal(calls.length, 2);
  assert.equal(original.provenance.fingerprint, fingerprint, "client must not mutate Hikari state/request provenance");
});

test("stale response, forbidden fields, and malformed operation fail closed", async () => {
  const invalid = request();
  (invalid as unknown as Record<string, unknown>).path = "C:\\secret";
  assert.throws(() => validateRenderRequest(invalid), HikariMitsubaBridgeError);
  const changed = request("stale-client");
  const client = new HikariMitsubaClient({
    fetchImpl: async (input) => String(input).endsWith("/v1/render")
      ? responseJson(metadata(changed, { provenanceFingerprint: "d".repeat(64) }))
      : new Response(artifact, { headers: { "Content-Type": "image/png" } }),
  });
  await assert.rejects(client.render(changed), (error: unknown) => error instanceof HikariMitsubaBridgeError && error.code === "stale_result");
});

test("offline and cancellation are explicit client outcomes", async () => {
  const offline = new HikariMitsubaClient({ fetchImpl: async () => { throw new Error("offline"); } });
  await assert.rejects(offline.capabilities(), (error: unknown) => error instanceof HikariMitsubaBridgeError && error.code === "offline");

  const controller = new AbortController();
  let cancelCalled = false;
  const cancelClient = new HikariMitsubaClient({
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/cancel")) {
        cancelCalled = true;
        return responseJson({ requestId: "cancel-client", cancelled: true, status: "cancellation-requested" });
      }
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        controller.abort();
      });
    },
  });
  await assert.rejects(cancelClient.render(request("cancel-client"), { signal: controller.signal }), (error: unknown) => error instanceof HikariMitsubaBridgeError && error.code === "cancelled");
  assert.equal(cancelCalled, true);
});

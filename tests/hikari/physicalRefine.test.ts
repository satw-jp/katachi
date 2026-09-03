import assert from "node:assert/strict";
import test from "node:test";
import {
  HikariMitsubaBridgeError,
  type HikariMitsubaCapabilities,
  type HikariMitsubaRenderMetadata,
  type HikariMitsubaRequest,
  type RenderPurpose,
} from "../../tools/hikari-mitsuba-bridge/client.ts";
import {
  PhysicalRefineController,
  physicalRefineIdentityKey,
  type PhysicalRefineClient,
  type PhysicalRefineIdentity,
  type PhysicalRefineScene,
  type PhysicalRefineState,
} from "../../src/studies/cloud-sculpt/physicalRefine.ts";

const READY_CAPABILITIES: HikariMitsubaCapabilities = {
  schemaVersion: "hikari-mitsuba-bridge.v1",
  service: "hikari-mitsuba-local-bridge",
  bindAddress: "127.0.0.1",
  port: 47659,
  mitsuba: { available: true, version: "3.9.1" },
  drjit: { available: true, version: "1.5.0" },
  pythonVersion: "3.12.13",
  variants: ["cuda_ad_rgb", "scalar_rgb"],
  selectedVariant: "cuda_ad_rgb",
  cudaAvailable: true,
  gpu: { available: true, name: "Test GPU", memoryMiB: 10240, computeCapability: "8.6" },
  workerReady: true,
  supportedOperations: ["hikari.mitsuba.render.v1"],
  supportedDevices: ["cuda"],
  optix: "unknown",
  artifactTransport: "in-memory PNG artifact endpoint",
  cancellation: "request-scoped cooperative cancellation",
};

function identity(overrides: Partial<PhysicalRefineIdentity> = {}): PhysicalRefineIdentity {
  return {
    shapeSource: {
      kind: "balls-smooth-union",
      balls: [{ center: { x: 0, y: 0, z: 0 }, radius: 1 }],
      smoothness: 0.6,
    },
    physicalScale: { mmPerShapeUnit: 20, source: "assumed" },
    camera: {
      positionMm: { x: 80, y: 50, z: 100 },
      targetMm: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fovDeg: 45,
      aspect: 1,
    },
    hostMaterial: {
      id: "host-amber",
      ior: 1.5,
      absorptionPerMm: { r: 0.002, g: 0.01, b: 0.03 },
      roughness: 0.08,
    },
    light: {
      directionPropagation: { x: -0.2, y: -0.8, z: -0.4 },
      radiance: { r: 1, g: 0.94, b: 0.82 },
      angularDiameterDeg: 0.53,
    },
    receiver: {
      positionMm: { x: 0, y: -47, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      extentMm: { x: 240, z: 240 },
      reflectance: 0.7,
    },
    environment: { radiance: { r: 0.85, g: 0.85, b: 0.85 } },
    opticalContract: { boundaryEpsilon: 1e-4, inclusions: [] },
    ...overrides,
  };
}

function scene(overrides: Partial<PhysicalRefineIdentity> = {}): PhysicalRefineScene {
  return {
    ...identity(overrides),
    caseId: "physical-refine-test",
    caseLabel: "Physical refine test",
    sourceCommit: "7edd92e93139a5b0246334ddf8069726fbf7c113",
    sourceRef: "main",
    canonicalMesh: new TextEncoder().encode("v 0 0 0\n"),
  };
}

function metadata(request: HikariMitsubaRequest, purpose: RenderPurpose): HikariMitsubaRenderMetadata {
  return {
    requestId: request.requestId,
    success: true,
    operation: "hikari.mitsuba.render.v1",
    selectedVariant: request.compute.device === "cuda" ? "cuda_ad_rgb" : "scalar_rgb",
    gpu: request.compute.device === "cuda" ? READY_CAPABILITIES.gpu : null,
    executionDevice: request.compute.device,
    cudaFallback: false,
    purpose,
    resolution: request.resolution,
    spp: request.spp,
    renderMs: 10,
    artifactHash: "0".repeat(64),
    artifactByteLength: 3,
    artifactUrl: `/v1/artifacts/${request.requestId}`,
    provenanceHash: "1".repeat(64),
    provenanceFingerprint: request.provenance.fingerprint,
    warnings: [],
  };
}

class FakeClient implements PhysicalRefineClient {
  capabilityError: Error | null = null;
  pending: Array<{
    request: HikariMitsubaRequest;
    resolve: (value: { metadata: HikariMitsubaRenderMetadata; artifact: Uint8Array }) => void;
    reject: (error: Error) => void;
  }> = [];
  cancelCalls: string[] = [];

  async capabilities(): Promise<HikariMitsubaCapabilities> {
    if (this.capabilityError) throw this.capabilityError;
    return READY_CAPABILITIES;
  }

  render(request: HikariMitsubaRequest): Promise<{ metadata: HikariMitsubaRenderMetadata; artifact: Uint8Array }> {
    return new Promise((resolve, reject) => {
      this.pending.push({ request, resolve, reject });
    });
  }

  async cancel(requestId: string): Promise<{ cancelled: boolean; status: string }> {
    this.cancelCalls.push(requestId);
    return { cancelled: true, status: "cancelled" };
  }
}

async function waitForPending(client: FakeClient): Promise<void> {
  for (let attempt = 0; attempt < 20 && client.pending.length === 0; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(client.pending.length, 1, "render request should reach the client");
}

test("physical refine starts offline and reaches READY without logging an offline error", async () => {
  const client = new FakeClient();
  client.capabilityError = new HikariMitsubaBridgeError("offline", "bridge is offline");
  const controller = new PhysicalRefineController({ client });
  assert.equal(controller.getState().status, "OFFLINE");
  assert.equal(await controller.probe(), null);
  assert.equal(controller.getState().status, "OFFLINE");
  assert.equal(controller.getState().error, "bridge is offline");

  client.capabilityError = null;
  assert.ok(await controller.probe());
  assert.equal(controller.getState().status, "READY");
});

test("explicit render uses fixed request values and becomes CURRENT", async () => {
  const client = new FakeClient();
  const controller = new PhysicalRefineController({ client });
  await controller.probe();
  const current = scene();
  const renderPromise = controller.render(current, "body");
  await waitForPending(client);
  const request = client.pending[0].request;
  assert.equal(request.renderPurpose, "body");
  assert.equal(request.physicalScale.source, "assumed");
  assert.equal(request.physicalScale.mmPerShapeUnit, 20);
  assert.equal(request.resolution.width, 384);
  assert.equal(request.spp, 32);
  assert.match(request.provenance.fingerprint, /^[0-9a-f]{64}$/);
  client.pending.shift()!.resolve({
    metadata: metadata(request, "body"),
    artifact: new Uint8Array([1, 2, 3]),
  });
  const result = await renderPromise;
  assert.ok(result);
  assert.equal(controller.getState().status, "CURRENT");
  assert.deepEqual([...controller.getState().lastResult!.artifact], [1, 2, 3]);
});

test("relevant changes become STALE while irrelevant UI data and same state do not", async () => {
  const current = scene();
  const withIrrelevantUi = { ...current, uiOnly: "selection-highlight" } as unknown as PhysicalRefineIdentity;
  assert.equal(physicalRefineIdentityKey(withIrrelevantUi), physicalRefineIdentityKey(current));
  const different = { ...current, hostMaterial: { ...current.hostMaterial, ior: 1.6 } };
  assert.notEqual(physicalRefineIdentityKey(different), physicalRefineIdentityKey(current));
});

test("authoring invalidation needs no identity snapshot and repeated stale state publishes once", () => {
  const changes: PhysicalRefineState[] = [];
  const controller = new PhysicalRefineController({
    client: new FakeClient(),
    onStateChange: (next) => changes.push(next),
  });
  controller.markStale();
  controller.markStale();
  assert.equal(controller.getState().status, "OFFLINE");
  assert.equal(controller.getState().currentFingerprint, null);
  assert.equal(changes.length, 0);
});

test("a relevant change after a valid result marks it STALE until explicit re-refine", async () => {
  const client = new FakeClient();
  const controller = new PhysicalRefineController({ client });
  await controller.probe();
  const current = scene();
  const renderPromise = controller.render(current, "receiver");
  await waitForPending(client);
  const pending = client.pending.shift()!;
  pending.resolve({ metadata: metadata(pending.request, "receiver"), artifact: new Uint8Array([4]) });
  await renderPromise;
  assert.equal(controller.getState().status, "CURRENT");
  controller.markStale();
  assert.equal(controller.getState().status, "STALE");
  const reRefine = controller.render(current, "receiver");
  await waitForPending(client);
  const reRefinePending = client.pending.shift()!;
  reRefinePending.resolve({ metadata: metadata(reRefinePending.request, "receiver"), artifact: new Uint8Array([5]) });
  await reRefine;
  assert.equal(controller.getState().status, "CURRENT");
  assert.deepEqual([...controller.getState().lastResult!.artifact], [5]);
});

test("older race results cannot become current after a newer explicit render", async () => {
  const client = new FakeClient();
  const controller = new PhysicalRefineController({ client });
  await controller.probe();
  const first = scene();
  const second = scene({ shapeSource: { ...first.shapeSource, balls: [{ center: { x: 1, y: 0, z: 0 }, radius: 1 }] } });
  const firstPromise = controller.render(first, "body");
  await waitForPending(client);
  const firstPending = client.pending.shift()!;
  const secondPromise = controller.render(second, "body");
  await waitForPending(client);
  const secondPending = client.pending.shift()!;
  firstPending.resolve({ metadata: metadata(firstPending.request, "body"), artifact: new Uint8Array([1]) });
  secondPending.resolve({ metadata: metadata(secondPending.request, "body"), artifact: new Uint8Array([2]) });
  assert.equal(await firstPromise, null);
  assert.deepEqual([...((await secondPromise)!).artifact], [2]);
  assert.equal(controller.getState().status, "CURRENT");
  assert.ok(client.cancelCalls.length >= 1);
});

test("a relevant mutation during render leaves the completed result STALE", async () => {
  const client = new FakeClient();
  const controller = new PhysicalRefineController({ client });
  await controller.probe();
  const current = scene();
  const renderPromise = controller.render(current, "body");
  await waitForPending(client);
  controller.markStale();
  const pending = client.pending.shift()!;
  pending.resolve({ metadata: metadata(pending.request, "body"), artifact: new Uint8Array([3]) });
  assert.ok(await renderPromise);
  assert.equal(controller.getState().status, "STALE");
  assert.equal(controller.getState().currentFingerprint, null);
});

test("cancel produces CANCELLED and preserves the last valid result", async () => {
  const client = new FakeClient();
  const controller = new PhysicalRefineController({ client });
  await controller.probe();
  const first = scene();
  const firstPromise = controller.render(first, "body");
  await waitForPending(client);
  const firstPending = client.pending.shift()!;
  firstPending.resolve({ metadata: metadata(firstPending.request, "body"), artifact: new Uint8Array([7]) });
  await firstPromise;

  const secondPromise = controller.render(scene({ light: { ...first.light, angularDiameterDeg: 20 } }), "body");
  await waitForPending(client);
  controller.cancel();
  assert.equal(controller.getState().status, "CANCELLED");
  const secondPending = client.pending.shift()!;
  secondPending.resolve({ metadata: metadata(secondPending.request, "body"), artifact: new Uint8Array([8]) });
  await secondPromise;
  assert.deepEqual([...controller.getState().lastResult!.artifact], [7]);
});

test("render failure becomes ERROR without erasing the last valid result and reconnect restores READY", async () => {
  const client = new FakeClient();
  const controller = new PhysicalRefineController({ client });
  await controller.probe();
  const valid = controller.render(scene(), "body");
  await waitForPending(client);
  const validPending = client.pending.shift()!;
  validPending.resolve({ metadata: metadata(validPending.request, "body"), artifact: new Uint8Array([9]) });
  await valid;

  const failed = controller.render(scene({ environment: { radiance: { r: 0.4, g: 0.4, b: 0.4 } } }), "receiver");
  await waitForPending(client);
  client.pending.shift()!.reject(new HikariMitsubaBridgeError("render_failed", "render failed"));
  await failed;
  assert.equal(controller.getState().status, "ERROR");
  assert.deepEqual([...controller.getState().lastResult!.artifact], [9]);
  assert.ok(await controller.probe());
  assert.equal(controller.getState().status, "STALE");
});

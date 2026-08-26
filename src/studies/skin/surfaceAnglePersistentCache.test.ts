import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSurfacePersistentCacheKeys,
  compareSurfaceCacheComponents,
  createSurfaceWorkerOnCacheMiss,
  createAutomaticSupportClassificationWorkerOnCacheMiss,
  detectSurfacePersistentCacheCapability,
  runSurfacePersistentCacheIfAvailable,
  surfacePersistentCacheRoute,
  type SurfaceAngleResult,
} from "./surfaceAnglePersistentCache.ts";
import { OVERHANG_SUPPORT_POLICY } from "./overhangSupportPolicy.ts";
import { SUPPORT_REACHABILITY_RAY_EPSILON_VERSION } from "./supportReachability.ts";
import type { SurfaceAngleDiagnosisBuildRequest } from "./surfaceAngleWorkerProtocol.ts";

const versions = {
  supportClassificationPolicyVersion: OVERHANG_SUPPORT_POLICY,
  rayEpsilonVersion: SUPPORT_REACHABILITY_RAY_EPSILON_VERSION,
};

function cachedResult(): SurfaceAngleResult {
  return {
    type: "result", generation: 1,
    metrics: {
      thresholdDeg: 45, surfaceArea: 1, dangerousAreaBefore: 0, dangerousAreaAfter: 0,
      mitigatedArea: 0, dangerousFaceCountBefore: 0, dangerousFaceCountAfter: 0,
      mitigatedFaceCount: 0, contactTolerance: 0.01,
    },
    basePositions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    baseNormals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    baseFaceCount: 1, resolution: 48, internalEdgeCount: 0, motifLowestPoints: [],
    beforeDangerPositions: new Float32Array(), afterDangerPositions: new Float32Array(),
    mitigatedPositions: new Float32Array(), elapsedMs: 1,
  };
}

function buildRequest(): SurfaceAngleDiagnosisBuildRequest {
  return {
    type: "build", generation: 1,
    host: [{ id: 0, x: 0, y: 0, z: 0, r: 1 }], hostK: 0.2, thickness: 0.1, patches: [],
    internalGraph: null, roundK: 0.1, coinBulge: 0, coinBulgeBalance: 0,
    quadMeshJoinWidth: 0.1, mode: "plate", thresholdDeg: 45, resolution: 48,
    targetLongestMm: 119.5, workerCount: 1,
  };
}

function availableRuntime() {
  return {
    crypto: { subtle: { digest: () => Promise.resolve(new ArrayBuffer(32)) } },
    indexedDB: {},
    isSecureContext: false,
    location: { origin: "http://192.168.0.20:5173" },
    Worker: function Worker() {},
    navigator: { hardwareConcurrency: 8 },
  };
}

test("capability seam reports LAN diagnostics without treating secure context as the cache gate", () => {
  const capability = detectSurfacePersistentCacheCapability(availableRuntime());
  assert.equal(capability.origin, "http://192.168.0.20:5173");
  assert.equal(capability.isSecureContext, false);
  assert.equal(capability.cryptoAvailable, true);
  assert.equal(capability.subtleAvailable, true);
  assert.equal(capability.digestAvailable, true);
  assert.equal(capability.indexedDBAvailable, true);
  assert.equal(capability.workerAvailable, true);
  assert.equal(capability.hardwareConcurrency, 8);
  assert.equal(capability.cacheAvailable, true);
  assert.equal(surfacePersistentCacheRoute(capability), "persistent-cache");
});

test("missing crypto.subtle.digest is unavailable and never becomes a weak hash route", () => {
  const capability = detectSurfacePersistentCacheCapability({
    ...availableRuntime(), crypto: { subtle: { digest: undefined } },
  });
  assert.equal(capability.cryptoAvailable, true);
  assert.equal(capability.subtleAvailable, true);
  assert.equal(capability.digestAvailable, false);
  assert.equal(capability.cacheAvailable, false);
  assert.equal(surfacePersistentCacheRoute(capability), "fresh-worker");
  assert.ok(capability.unavailableReasons.includes("crypto.subtle.digest"));
});

test("missing IndexedDB is unavailable even when WebCrypto is complete", () => {
  const capability = detectSurfacePersistentCacheCapability({
    ...availableRuntime(), indexedDB: undefined,
  });
  assert.equal(capability.digestAvailable, true);
  assert.equal(capability.indexedDBAvailable, false);
  assert.equal(capability.cacheAvailable, false);
  assert.ok(capability.unavailableReasons.includes("indexedDB"));
});

test("unavailable cache gate skips read/write/migration work", async () => {
  const capability = detectSurfacePersistentCacheCapability({
    ...availableRuntime(), crypto: undefined,
  });
  let cacheCalls = 0;
  const result = await runSurfacePersistentCacheIfAvailable(capability, async () => {
    cacheCalls++;
    return "cache-result";
  });
  assert.equal(result, undefined);
  assert.equal(cacheCalls, 0);
});

test("cache key generation remains fail-closed when the injected SHA-256 seam fails", async () => {
  let errorMessage = "";
  try {
    await buildSurfacePersistentCacheKeys(buildRequest(), versions, async () => {
      throw new Error("digest unavailable");
    });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }
  assert.equal(errorMessage, "digest unavailable");
});

test("unavailable route still permits exactly one fresh Surface Worker", () => {
  const capability = detectSurfacePersistentCacheCapability({
    ...availableRuntime(), indexedDB: null,
  });
  assert.equal(surfacePersistentCacheRoute(capability), "fresh-worker");
  let launches = 0;
  const worker = createSurfaceWorkerOnCacheMiss(null, () => {
    launches++;
    return { terminate() {} };
  });
  assert.ok(worker);
  assert.equal(launches, 1);
});

test("cache hit forbids Worker construction", () => {
  let launches = 0;
  const worker = createSurfaceWorkerOnCacheMiss(cachedResult(), () => { launches++; return { terminate() {} }; });
  assert.equal(worker, null);
  assert.equal(launches, 0);
});

test("classification ledger hit forbids automatic-classification Worker construction", () => {
  let launches = 0;
  const worker = createAutomaticSupportClassificationWorkerOnCacheMiss({} as never, () => { launches++; return { terminate() {} }; });
  assert.equal(worker, null);
  assert.equal(launches, 0);
});

test("classification ledger miss permits exactly one automatic-classification Worker", () => {
  let launches = 0;
  const worker = createAutomaticSupportClassificationWorkerOnCacheMiss(null, () => { launches++; return { terminate() {} }; });
  assert.ok(worker);
  assert.equal(launches, 1);
});

test("cache miss permits exactly one Worker construction", () => {
  let launches = 0;
  const worker = createSurfaceWorkerOnCacheMiss(null, () => { launches++; return { terminate() {} }; });
  assert.ok(worker);
  assert.equal(launches, 1);
});

test("mesh key ignores commit-equivalent UI state, generation, workers, physical size, threshold and derived Dry Web graph", async () => {
  const first = buildRequest();
  const second: SurfaceAngleDiagnosisBuildRequest = {
    ...buildRequest(), generation: 99, workerCount: 8, targetLongestMm: 80, thresholdDeg: 50,
    internalGraph: {
      kind: "targetedGrid", nodes: [], edges: [],
      stats: { inputPoints: 0, delaunayTetrahedra: 0, candidateEdges: 0, clippedEdges: 0, removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0 },
    },
  };
  const a = await buildSurfacePersistentCacheKeys(first, versions);
  const b = await buildSurfacePersistentCacheKeys(second, versions);
  assert.equal(a.meshKey, b.meshKey);
  assert.notEqual(a.diagnosisKey, b.diagnosisKey);
});

test("mesh resolution and stable shape fingerprint invalidate only the appropriate mesh", async () => {
  const base = await buildSurfacePersistentCacheKeys(buildRequest(), versions);
  const resolution = await buildSurfacePersistentCacheKeys({ ...buildRequest(), resolution: 128 }, versions);
  const shape = await buildSurfacePersistentCacheKeys({ ...buildRequest(), hostK: 0.25 }, versions);
  assert.notEqual(base.meshKey, resolution.meshKey);
  assert.notEqual(base.meshKey, shape.meshKey);
});

test("diagnosis key changes with size, threshold, support policy or epsilon version without changing mesh key", async () => {
  const base = await buildSurfacePersistentCacheKeys(buildRequest(), versions);
  for (const [request, changedVersions] of [
    [{ ...buildRequest(), targetLongestMm: 80 }, versions],
    [{ ...buildRequest(), thresholdDeg: 50 }, versions],
    [buildRequest(), { ...versions, supportClassificationPolicyVersion: "policy-v-next" }],
    [buildRequest(), { ...versions, rayEpsilonVersion: "epsilon-v-next" }],
  ] as const) {
    const changed = await buildSurfacePersistentCacheKeys(request, changedVersions);
    assert.equal(changed.meshKey, base.meshKey);
    assert.notEqual(changed.diagnosisKey, base.diagnosisKey);
  }
});

test("miss diagnostics name the exact differing key components", () => {
  assert.deepEqual(compareSurfaceCacheComponents(
    { surfaceMeshKey: "mesh:a", targetLongestMm: 119.5, angleThresholdDeg: 45 },
    { surfaceMeshKey: "mesh:a", targetLongestMm: 80, angleThresholdDeg: 45 },
  ), [{ component: "targetLongestMm", current: 119.5, saved: 80 }]);
});

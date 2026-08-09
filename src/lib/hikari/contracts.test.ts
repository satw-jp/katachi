import assert from "node:assert/strict";

import { fieldSdf, type Ball } from "../../studies/cloud-sculpt/field.ts";
import {
  cloudShapeBounds,
  cloudShapeFingerprint,
  createCloudHikariShape,
} from "../../studies/cloud-sculpt/hikariAdapter.ts";
import {
  createCloudHikariCase,
  restoreCloudHikariCase,
} from "../../studies/cloud-sculpt/hikariCaseAdapter.ts";
import { DEFAULT_HIKARI_SETTINGS } from "../../studies/cloud-sculpt/hikari.ts";
import { createEmptyState, record, type HistoryEntry } from "../../studies/cloud-sculpt/history.ts";
import {
  createRuntimeShape,
  parseHikariCase,
  parseShapeAsset,
  serializeHikariCase,
  serializeShapeAsset,
  validateOpticalScene,
  type HikariCase,
  type OpticalScene,
  type ShapeAsset,
} from "./index.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const balls: Ball[] = [
  { id: 1, x: -0.35, y: 0, z: 0, r: 0.8 },
  { id: 2, x: 0.45, y: 0.1, z: 0, r: 0.65 },
];

const cloudAsset: ShapeAsset = {
  formatVersion: 1,
  id: "cloud-baseline",
  revision: "test-1",
  source: { studyId: "cloud-sculpt", studyVersion: "0.19.0" },
  bounds: { min: { x: -2, y: -2, z: -2 }, max: { x: 2, y: 2, z: 2 } },
  nativeMmPerShapeUnit: 25,
  representation: {
    kind: "metaballs-v1",
    balls: balls.map((ball) => ({
      id: String(ball.id),
      x: ball.x,
      y: ball.y,
      z: ball.z,
      radius: ball.r,
      regionId: "body",
    })),
    smoothK: 0.4,
    distanceQuality: "distance-like",
    recommendedStepScale: 0.72,
  },
  regions: [{ id: "body", label: "body", authoredRole: "host" }],
  recipe: { studyId: "cloud-sculpt", entries: [] },
  sourceHash: "test-cloud-hash",
  approximations: ["smooth-union field is distance-like, not an exact Euclidean SDF"],
};

const identityTransform = {
  translation: { x: 0, y: 0, z: 0 },
  rotation: [0, 0, 0, 1] as [number, number, number, number],
  uniformScale: 1,
};

const scene: OpticalScene = {
  formatVersion: 1,
  physicalScale: { mmPerShapeUnit: 25, mode: "same-material" },
  objectPose: identityTransform,
  host: {
    id: "host",
    shapeAssetId: cloudAsset.id,
    transform: identityTransform,
    material: {
      id: "clear-resin",
      ior: 1.5,
      absorptionPerMm: [0.001, 0.002, 0.004],
      roughness: 0.05,
    },
    regionBindings: [{ regionId: "body", opticalRole: "boundary" }],
  },
  inclusions: [],
  receiver: {
    origin: { x: 0, y: -2.2, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    up: { x: 0, y: 0, z: -1 },
    widthShapeUnits: 8,
    heightShapeUnits: 8,
  },
  light: {
    kind: "directional",
    direction: { x: 0.4, y: -0.8, z: 0.2 },
    color: [1, 0.95, 0.85],
    intensity: 1,
    angularDiameterDeg: 0.53,
  },
  camera: {
    position: { x: 4, y: 2.5, z: 5 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fovYDeg: 45,
    near: 0.1,
    far: 100,
  },
  approximations: ["single-pass reference scene"],
};

test("metaball adapter matches the existing Cloud Sculpt field", () => {
  const runtime = createRuntimeShape(cloudAsset);
  const points = [
    { x: 0, y: 0, z: 0 },
    { x: 0.7, y: 0.2, z: -0.1 },
    { x: 1.8, y: 0.4, z: 0.3 },
  ];
  for (const point of points) {
    assert.ok(
      Math.abs(runtime.distance(point) - fieldSdf(balls, 0.4, point.x, point.y, point.z)) < 1e-12,
    );
  }
  assert.equal(runtime.regionAt({ x: -0.35, y: 0, z: 0 }), "body");
});

test("Cloud Sculpt adapter preserves exact geometry and deterministic identity", () => {
  const source = createCloudHikariShape(balls, 0.4, {
    studyVersion: "0.19.0",
    recipe: { formatVersion: 1, studyId: "cloud-sculpt", entries: [] },
  });
  assert.ok(source !== null);
  assert.equal(source?.asset.sourceHash, cloudShapeFingerprint(balls, 0.4));
  assert.deepEqual(source?.asset.bounds, cloudShapeBounds(balls));
  assert.equal(createCloudHikariShape([], 0.4), null);
  for (const point of [
    { x: 0, y: 0, z: 0 },
    { x: -1.1, y: 0.2, z: 0.3 },
    { x: 1.4, y: -0.1, z: 0.2 },
  ]) {
    assert.ok(
      Math.abs((source?.runtime.distance(point) ?? 0) - fieldSdf(balls, 0.4, point.x, point.y, point.z)) < 1e-12,
    );
  }
  const moved = balls.map((ball) => ({ ...ball }));
  moved[0].x += Number.EPSILON;
  assert.notEqual(cloudShapeFingerprint(moved, 0.4), cloudShapeFingerprint(balls, 0.4));

  const traced = createCloudHikariShape(balls, 0.4, { surfaceTraceStrength: 0.14 });
  assert.ok(traced);
  assert.notEqual(traced.asset.sourceHash, source?.asset.sourceHash);
  assert.equal(
    traced.asset.representation.kind === "metaballs-v1"
      ? traced.asset.representation.surfaceTrace?.strength
      : null,
    0.14,
  );
  assert.deepEqual(parseShapeAsset(serializeShapeAsset(traced.asset)), traced.asset);
});

test("ShapeAsset JSON round-trip preserves the source representation", () => {
  const parsed = parseShapeAsset(serializeShapeAsset(cloudAsset));
  assert.deepEqual(parsed, cloudAsset);
  assert.throws(() => serializeShapeAsset({ ...cloudAsset, recipe: { invalid: Number.NaN } }));
});

test("sampled signed-distance field interpolates and estimates a normal", () => {
  const values: number[] = [];
  for (let z = 0; z < 2; z++) {
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) values.push(x - 0.5);
    }
  }
  const asset: ShapeAsset = {
    ...cloudAsset,
    id: "sampled-plane",
    representation: {
      kind: "sampled-field-v1",
      dimensions: [2, 2, 2],
      values,
      scalarMeaning: "signed-distance",
      isoValue: 0,
      distanceQuality: "signed-distance",
      recommendedStepScale: 0.9,
      regionIds: ["body"],
      regionLabels: new Array(8).fill(0),
    },
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
  };
  const runtime = createRuntimeShape(asset);
  assert.ok(Math.abs(runtime.distance({ x: 0.25, y: 0.4, z: 0.8 }) + 0.25) < 1e-12);
  assert.equal(runtime.contains({ x: 0.25, y: 0.4, z: 0.8 }), true);
  assert.equal(runtime.regionAt({ x: 0.75, y: 0.4, z: 0.8 }), "body");
  const normal = runtime.normal({ x: 0.5, y: 0.5, z: 0.5 });
  assert.ok(normal !== null);
  assert.ok(Math.abs((normal?.x ?? 0) - 1) < 1e-12);
});

test("density fields use iso-density as the inside-negative level set", () => {
  const asset: ShapeAsset = {
    ...cloudAsset,
    id: "density-field",
    representation: {
      kind: "sampled-field-v1",
      dimensions: [2, 2, 2],
      values: [0, 1, 0, 1, 0, 1, 0, 1],
      scalarMeaning: "density",
      isoValue: 0.5,
      distanceQuality: "level-set",
      recommendedStepScale: 0.35,
    },
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
  };
  const runtime = createRuntimeShape(asset);
  assert.ok(runtime.distance({ x: 0.75, y: 0.5, z: 0.5 }) < 0);
  assert.ok(runtime.distance({ x: 0.25, y: 0.5, z: 0.5 }) > 0);
});

test("OpticalScene validates asset and authored-region references", () => {
  validateOpticalScene(scene, [cloudAsset]);
  const broken = { ...scene, host: { ...scene.host, shapeAssetId: "missing" } };
  assert.throws(() => validateOpticalScene(broken, [cloudAsset]));
});

test("OpticalScene preserves several independently transformed inclusions", () => {
  const inclusionMaterial = {
    id: "clear-inclusion",
    ior: 1.42,
    absorptionPerMm: [0, 0, 0] as [number, number, number],
    roughness: 0.02,
  };
  const several: OpticalScene = {
    ...scene,
    inclusions: [
      {
        id: "inclusion-a",
        shapeAssetId: cloudAsset.id,
        transform: {
          ...identityTransform,
          translation: { x: -0.35, y: 0.1, z: 0 },
          uniformScale: 0.28,
        },
        material: inclusionMaterial,
        regionBindings: [{ regionId: "body", opticalRole: "boundary" }],
      },
      {
        id: "inclusion-b",
        shapeAssetId: cloudAsset.id,
        transform: {
          ...identityTransform,
          translation: { x: 0.4, y: -0.05, z: 0.16 },
          uniformScale: 0.2,
        },
        material: { ...inclusionMaterial, id: "soft-inclusion", ior: 1.36 },
        regionBindings: [{ regionId: "body", opticalRole: "boundary" }],
      },
    ],
  };
  validateOpticalScene(several, [cloudAsset]);
  const value: HikariCase = {
    formatVersion: 1,
    id: "several-inclusions",
    capturedAtUtc: "2026-08-01T02:00:00.000Z",
    appVersion: "0.19.0",
    gitCommit: null,
    assets: [cloudAsset],
    scene: several,
    renderer: { backend: "cpu", sampleCount: 4096 },
    controls: {},
    observation: { observed: [], interpretation: [], decision: [] },
    approximations: ["contract-only; live multi-boundary transport is not implemented"],
  };
  assert.deepEqual(parseHikariCase(serializeHikariCase(value)).scene.inclusions, several.inclusions);
  assert.throws(() => validateOpticalScene({
    ...several,
    inclusions: [several.inclusions[0], { ...several.inclusions[1], id: "inclusion-a" }],
  }, [cloudAsset]));
});

test("HikariCase round-trip reopens without localStorage", () => {
  const value: HikariCase = {
    formatVersion: 1,
    id: "baseline-001",
    capturedAtUtc: "2026-08-01T00:00:00.000Z",
    appVersion: "0.19.0",
    gitCommit: null,
    assets: [cloudAsset],
    scene,
    renderer: { backend: "cpu", sampleCount: 56 },
    controls: { phenomenon: "optics", ior: 1.5, raysVisible: false },
    observation: {
      observed: ["baseline contract fixture"],
      interpretation: [],
      decision: ["keep as the first migration case"],
    },
    approximations: ["no geometric containment test yet"],
  };
  assert.deepEqual(parseHikariCase(serializeHikariCase(value)), value);
});

test("Cloud Hikari case restores recipe, shape identity, controls, and camera", () => {
  const history: HistoryEntry[] = [];
  const state = createEmptyState();
  record(history, state, "setParam", { key: "k", value: 0.4 });
  for (const ball of balls) record(history, state, "addBall", { ...ball });
  const camera = {
    position: { x: 4, y: 2.5, z: 5 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fovYDeg: 45,
    near: 0.1,
    far: 100,
  };
  const saved = createCloudHikariCase({
    id: "cloud-live-case",
    capturedAtUtc: "2026-08-01T01:00:00.000Z",
    appVersion: "0.19.0",
    balls: state.balls,
    smoothK: state.params.k,
    history,
    settings: { ...DEFAULT_HIKARI_SETTINGS, phenomenon: "optics", ior: 1.47 },
    camera,
    rendererBackend: "cpu",
  });
  const reopened = parseHikariCase(serializeHikariCase(saved));
  const restored = restoreCloudHikariCase(reopened);
  assert.deepEqual(restored.state.balls, state.balls);
  assert.equal(restored.state.params.k, 0.4);
  assert.equal(restored.settings.ior, 1.47);
  assert.equal(restored.settings.surfaceVariation, DEFAULT_HIKARI_SETTINGS.surfaceVariation);
  assert.equal(
    reopened.assets[0].representation.kind === "metaballs-v1"
      ? reopened.assets[0].representation.surfaceTrace?.strength
      : null,
    DEFAULT_HIKARI_SETTINGS.surfaceVariation,
  );
  assert.deepEqual(restored.camera, camera);

  const broken = structuredClone(reopened);
  broken.assets[0].sourceHash = "fnv1a32:00000000";
  assert.throws(() => restoreCloudHikariCase(broken));
});

if (process.exitCode !== 1) console.log(`passed ${passed} hikari contract tests`);

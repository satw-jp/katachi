import assert from "node:assert/strict";
import { test } from "node:test";
import { createImportedHostInstance, createImportedHostSource, type HostVec3 } from "../externalStlHost.ts";
import {
  auditSparseRemovableSupportForbiddenCapsule,
  type SparseRemovableSupportRequest,
  type SparseSupportRouteSegment,
} from "./sparseRemovableSupport.ts";

type Triangle = readonly [HostVec3, HostVec3, HostVec3];

const cubeTriangles: readonly Triangle[] = [
  [{ x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: 1, y: 1, z: 1 }],
  [{ x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }, { x: 1, y: -1, z: 1 }],
  [{ x: -1, y: -1, z: -1 }, { x: -1, y: 1, z: 1 }, { x: -1, y: 1, z: -1 }],
  [{ x: -1, y: -1, z: -1 }, { x: -1, y: -1, z: 1 }, { x: -1, y: 1, z: 1 }],
  [{ x: -1, y: 1, z: -1 }, { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: -1 }],
  [{ x: -1, y: 1, z: -1 }, { x: -1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }],
  [{ x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: -1, z: 1 }],
  [{ x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: 1 }, { x: -1, y: -1, z: 1 }],
  [{ x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }],
  [{ x: -1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }],
  [{ x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: 1, y: -1, z: -1 }],
  [{ x: -1, y: -1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: 1, y: 1, z: -1 }],
];

function asciiStl(): ArrayBuffer {
  const text = [
    "solid cube",
    ...cubeTriangles.flatMap(([a, b, c]) => [
      "facet normal 0 0 0", "  outer loop",
      `    vertex ${a.x} ${a.y} ${a.z}`,
      `    vertex ${b.x} ${b.y} ${b.z}`,
      `    vertex ${c.x} ${c.y} ${c.z}`,
      "  endloop", "endfacet",
    ]),
    "endsolid cube", "",
  ].join("\n");
  return new TextEncoder().encode(text).buffer;
}

function segment(start: HostVec3, end: HostVec3, radius = 0.1): SparseSupportRouteSegment {
  return { start, end, radius };
}

function baseRequest(forbiddenSdf: (x: number, y: number, z: number) => number): SparseRemovableSupportRequest {
  return { projectedOutsideFaces: [], plateZ: -5, shaftRadius: 0.1, neckRadius: 0.05, forbiddenSdf };
}

function resultKey(result: ReturnType<typeof auditSparseRemovableSupportForbiddenCapsule>): object {
  return { accepted: result.accepted, reason: result.reason, detail: result.detail };
}

test("closed-volume continuity fixtures match the legacy signed oracle", async () => {
  const source = await createImportedHostSource(asciiStl(), {
    filename: "cube.stl",
    interpretation: { unitStatus: "explicit", mmPerSourceUnit: 1, upAxis: "y", handedness: "right", importPolicyVersion: "test" },
  });
  const host = createImportedHostInstance(source, { translation: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], uniformScale: 1 });
  assert.ok(host.signedVolumeQuery);
  const signed = (x: number, y: number, z: number): number => host.signedVolumeQuery!.signedDistance({ x, y, z });
  const unsigned = (x: number, y: number, z: number): number => host.query.closestSurface({ x, y, z })?.distance ?? Number.NaN;
  const threshold = 0.1 + 1e-7;
  const fixtures: ReadonlyArray<readonly [string, SparseSupportRouteSegment]> = [
    ["far exterior vertical", segment({ x: 3, y: 0, z: -3 }, { x: 3, y: 0, z: 3 })],
    ["far exterior leaning", segment({ x: 3, y: -2, z: -3 }, { x: 2.5, y: 2, z: 3 })],
    ["exterior tangent-near but clear", segment({ x: -2, y: 1.25, z: 0 }, { x: 2, y: 1.25, z: 0 })],
    ["exactly threshold-clear", segment({ x: -2, y: 1 + threshold, z: 0 }, { x: 2, y: 1 + threshold, z: 0 })],
    ["below-threshold near-surface", segment({ x: -2, y: 1.05, z: 0 }, { x: 2, y: 1.05, z: 0 })],
    ["exterior to interior crossing", segment({ x: 3, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })],
    ["interior to exterior crossing", segment({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 })],
    ["start inside", segment({ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 })],
    ["start on surface", segment({ x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })],
    ["segment fully inside", segment({ x: -0.5, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 })],
    ["narrow pass outside", segment({ x: -2, y: 1.1001, z: -0.8 }, { x: 2, y: 1.1001, z: 0.8 })],
    ["finite difficult adaptive subdivision", segment({ x: -1.5, y: 1.1002, z: -1.5 }, { x: 1.5, y: 1.1002, z: 1.5 })],
  ];
  for (const [name, fixture] of fixtures) {
    const legacy = auditSparseRemovableSupportForbiddenCapsule(fixture, baseRequest(signed));
    const accelerated = auditSparseRemovableSupportForbiddenCapsule(fixture, {
      ...baseRequest(signed), forbiddenClosedSurfaceDistance: unsigned,
    });
    assert.deepEqual(resultKey(accelerated), resultKey(legacy), name);
  }

  const multiSegment = [
    segment({ x: 3, y: 0, z: -3 }, { x: 3, y: 0, z: 0 }),
    segment({ x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 3 }),
    segment({ x: 3, y: 0, z: 3 }, { x: 0, y: 0, z: 0 }),
  ];
  const auditRoute = (accelerated: boolean) => multiSegment.map((fixture) => resultKey(
    auditSparseRemovableSupportForbiddenCapsule(fixture, {
      ...baseRequest(signed), ...(accelerated ? { forbiddenClosedSurfaceDistance: unsigned } : {}),
    }),
  ));
  assert.deepEqual(auditRoute(true), auditRoute(false), "multi-segment route fixture");
});

test("continuity accelerator is fail-closed for non-finite signed and unsigned queries", () => {
  const fixture = segment({ x: 3, y: 0, z: -1 }, { x: 3, y: 0, z: 1 });
  const signedNonFinite = auditSparseRemovableSupportForbiddenCapsule(fixture, {
    ...baseRequest(() => Number.NaN), forbiddenClosedSurfaceDistance: () => 2,
  });
  const unsignedNonFinite = auditSparseRemovableSupportForbiddenCapsule(fixture, {
    ...baseRequest(() => 2), forbiddenClosedSurfaceDistance: () => Number.NaN,
  });
  for (const result of [signedNonFinite, unsignedNonFinite]) {
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "forbidden");
  }
});

test("deterministic randomized closed-cube suite matches the legacy oracle", async () => {
  const source = await createImportedHostSource(asciiStl(), {
    filename: "cube.stl",
    interpretation: { unitStatus: "explicit", mmPerSourceUnit: 1, upAxis: "y", handedness: "right", importPolicyVersion: "test" },
  });
  const host = createImportedHostInstance(source, { translation: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], uniformScale: 1 });
  assert.ok(host.signedVolumeQuery);
  let state = 0x5eeda2;
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const signed = (x: number, y: number, z: number): number => host.signedVolumeQuery!.signedDistance({ x, y, z });
  const unsigned = (x: number, y: number, z: number): number => host.query.closestSurface({ x, y, z })?.distance ?? Number.NaN;
  for (let index = 0; index < 512; index += 1) {
    const point = (): HostVec3 => ({ x: random() * 8 - 4, y: random() * 8 - 4, z: random() * 8 - 4 });
    const fixture = segment(point(), point(), 0.02 + random() * 0.28);
    const legacy = auditSparseRemovableSupportForbiddenCapsule(fixture, baseRequest(signed));
    const accelerated = auditSparseRemovableSupportForbiddenCapsule(fixture, {
      ...baseRequest(signed), forbiddenClosedSurfaceDistance: unsigned,
    });
    assert.deepEqual(resultKey(accelerated), resultKey(legacy), `random segment ${index}`);
  }
});

test("continuity path collapses trusted signed queries to one per segment", () => {
  let signedCalls = 0;
  let unsignedCalls = 0;
  const signed = (x: number): number => { signedCalls += 1; return x - 1; };
  const unsigned = (x: number): number => { unsignedCalls += 1; return Math.abs(x - 1); };
  const fixture = segment({ x: 3, y: 0, z: -2 }, { x: 3, y: 0, z: 2 });
  const result = auditSparseRemovableSupportForbiddenCapsule(fixture, {
    ...baseRequest(signed), forbiddenClosedSurfaceDistance: unsigned,
  });
  assert.equal(result.accepted, true);
  assert.equal(signedCalls, 1);
  assert.ok(unsignedCalls > 1);
});

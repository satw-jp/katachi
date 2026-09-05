import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createImportedHostInstance,
  createImportedHostSource,
  type HostSourceInterpretation,
  type HostVec3,
} from "./externalStlHost.ts";
import {
  applyApprovedBoundaryRepair,
  APPROVED_USAGI_BOUNDARY_LOOPS,
  USAGI_REPAIR_POLICY_VERSION,
  USAGI_SOURCE_SHA256,
} from "./externalStlHostRepair.ts";

const interpretation: HostSourceInterpretation = {
  unitStatus: "explicit",
  mmPerSourceUnit: 1,
  upAxis: "y",
  handedness: "right",
  importPolicyVersion: "stl-host-v0",
};

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

function asciiStl(name: string, triangles: readonly Triangle[]): ArrayBuffer {
  const text = [
    `solid ${name}`,
    ...triangles.flatMap(([a, b, c]) => [
      "facet normal 0 0 0",
      "  outer loop",
      `    vertex ${a.x} ${a.y} ${a.z}`,
      `    vertex ${b.x} ${b.y} ${b.z}`,
      `    vertex ${c.x} ${c.y} ${c.z}`,
      "  endloop",
      "endfacet",
    ]),
    `endsolid ${name}`,
    "",
  ].join("\n");
  return new TextEncoder().encode(text).buffer;
}

const identity = {
  translation: { x: 0, y: 0, z: 0 },
  rotation: [0, 0, 0, 1] as const,
  uniformScale: 1,
};

async function repair(sourceBytes: ArrayBuffer, filename: string) {
  const source = await createImportedHostSource(sourceBytes, { filename, interpretation });
  const original = createImportedHostInstance(source, identity);
  return applyApprovedBoundaryRepair(original, {
    originalSourceSha256: source.sourceIdentity.sha256,
    repairPolicyVersion: USAGI_REPAIR_POLICY_VERSION,
    approvedBoundaryLoopIndices: [0],
  });
}

test("repair gate rejects a non-local boundary instead of broadening scope", async () => {
  let rejected = false;
  try {
    await repair(asciiStl("open-cube", cubeTriangles.slice(0, 11)), "open-cube.stl");
  } catch (error) {
    rejected = /not a plausible local fill candidate/.test(String(error));
  }
  assert.equal(rejected, true);
});

test("the approved rabbit repair preserves source bytes and promotes the actual host", async () => {
  if (!existsSync("C:/dev/samples/rabbit_230223.stl")) return;
  const bytes = readFileSync("C:/dev/samples/rabbit_230223.stl");
  const source = await createImportedHostSource(bytes, {
    filename: "rabbit_230223.stl",
    interpretation,
  });
  assert.equal(source.sourceIdentity.sha256, USAGI_SOURCE_SHA256);
  const originalBytes = Array.from(new Uint8Array(source.bytes));
  const original = createImportedHostInstance(source, { ...identity, uniformScale: 20 });
  assert.equal(original.volumePreflight.boundaryLoops.length, APPROVED_USAGI_BOUNDARY_LOOPS.length);
  assert.equal(original.capabilities.signedVolumeCapability.reason, "OPEN_BOUNDARY");
  const result = await applyApprovedBoundaryRepair(original, {
    originalSourceSha256: USAGI_SOURCE_SHA256,
    repairPolicyVersion: USAGI_REPAIR_POLICY_VERSION,
    approvedBoundaryLoopIndices: APPROVED_USAGI_BOUNDARY_LOOPS,
  });
  const topology = result.repaired.volumePreflight.diagnostics.topology;
  assert.deepEqual(Array.from(new Uint8Array(result.original.source.bytes)), originalBytes);
  assert.equal(topology.triangleCount, 204326);
  assert.equal(topology.validTriangleCount, 204326);
  assert.equal(topology.degenerateTriangleCount, 0);
  assert.equal(topology.boundaryEdgeCount, 0);
  assert.equal(topology.boundaryLoopCount, 0);
  assert.equal(topology.nonManifoldEdgeCount, 0);
  assert.equal(topology.orientationInconsistencyEdgeCount, 0);
  assert.equal(topology.connectedComponentCount, 1);
  assert.equal(result.materialization.removedDegenerateTriangleIndices.length, 7);
  assert.equal(result.materialization.provenance.repairParameters.insertedTriangleCount, 21);
  assert.equal(result.materialization.repairedFingerprint, "90258ce379e3b11aef7e6710ff98ff9f17678a53ae1c7905c3c967bd1e9437d6");
  assert.equal(result.repaired.volumePreflight.selfIntersection, "NOT_PROVEN");
  assert.equal(result.repaired.capabilities.signedVolumeCapability.availability, "AVAILABLE");
  assert.ok(result.repaired.signedVolumeQuery);
});

test("approved rabbit repair rejects a different source identity", async () => {
  const source = await createImportedHostSource(asciiStl("open-cube", cubeTriangles.slice(0, 11)), {
    filename: "open-cube.stl",
    interpretation,
  });
  const original = createImportedHostInstance(source, identity);
  let rejected = false;
  try {
    await applyApprovedBoundaryRepair(original, {
      originalSourceSha256: USAGI_SOURCE_SHA256,
      repairPolicyVersion: USAGI_REPAIR_POLICY_VERSION,
      approvedBoundaryLoopIndices: [0],
    });
  } catch (error) {
    rejected = /source hash does not match/.test(String(error));
  }
  assert.equal(rejected, true);
});

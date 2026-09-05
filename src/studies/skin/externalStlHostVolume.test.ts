import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDerivedRepairArtifact,
  proposeBoundaryRepair,
} from "./externalStlHostVolume.ts";
import {
  createImportedHostInstance,
  createImportedHostSource,
  type HostSourceInterpretation,
  type HostVec3,
} from "./externalStlHost.ts";

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

test("closed cube exposes signed volume capability and signed distance", async () => {
  const source = await createImportedHostSource(asciiStl("cube", cubeTriangles), {
    filename: "cube.stl",
    interpretation,
  });
  const instance = createImportedHostInstance(source, identity);
  assert.equal(instance.capabilities.surfaceCapability.availability, "AVAILABLE");
  assert.equal(instance.capabilities.signedVolumeCapability.availability, "AVAILABLE");
  assert.equal(instance.volumePreflight.validationStatus, "TOPOLOGICALLY_CLOSED");
  assert.equal(instance.volumePreflight.selfIntersection, "NOT_PROVEN");
  assert.equal(instance.volumePreflight.boundaryLoops.length, 0);
  assert.ok(instance.signedVolumeQuery);
  assert.equal(instance.signedVolumeQuery.insideOutside({ x: 0, y: 0, z: 0 }), "inside");
  assert.equal(instance.signedVolumeQuery.insideOutside({ x: 1, y: 0, z: 0 }), "surface");
  assert.equal(instance.signedVolumeQuery.insideOutside({ x: 3, y: 0, z: 0 }), "outside");
  assert.ok(instance.signedVolumeQuery.signedDistance({ x: 0, y: 0, z: 0 }) < 0);
  assert.equal(instance.signedVolumeQuery.signedDistance({ x: 1, y: 0, z: 0 }), 0);
  assert.ok(instance.signedVolumeQuery.signedDistance({ x: 3, y: 0, z: 0 }) > 0);
});

test("uniformScale 20 preserves query semantics and scales distances", async () => {
  const source = await createImportedHostSource(asciiStl("cube", cubeTriangles), {
    filename: "cube.stl",
    interpretation,
  });
  const unit = createImportedHostInstance(source, identity);
  const scaled = createImportedHostInstance(source, { ...identity, uniformScale: 20 });
  assert.ok(unit.signedVolumeQuery && scaled.signedVolumeQuery);
  assert.equal(scaled.signedVolumeQuery.insideOutside({ x: 0, y: 0, z: 0 }), "inside");
  assert.equal(scaled.signedVolumeQuery.insideOutside({ x: 20, y: 0, z: 0 }), "surface");
  assert.equal(scaled.signedVolumeQuery.insideOutside({ x: 60, y: 0, z: 0 }), "outside");
  const unitDistance = unit.signedVolumeQuery.signedDistance({ x: 3, y: 0, z: 0 });
  const scaledDistance = scaled.signedVolumeQuery.signedDistance({ x: 60, y: 0, z: 0 });
  assert.equal(scaledDistance, unitDistance * 20);
});

test("translation and rotation are shared by surface and signed queries", async () => {
  const source = await createImportedHostSource(asciiStl("cube", cubeTriangles), {
    filename: "cube.stl",
    interpretation,
  });
  const half = Math.sqrt(0.5);
  const instance = createImportedHostInstance(source, {
    translation: { x: 10, y: 20, z: 30 },
    rotation: [0, 0, half, half],
    uniformScale: 1,
  });
  assert.ok(instance.signedVolumeQuery);
  assert.equal(instance.signedVolumeQuery.insideOutside({ x: 10, y: 20, z: 30 }), "inside");
  assert.equal(instance.signedVolumeQuery.insideOutside({ x: 10, y: 21, z: 30 }), "surface");
  assert.equal(instance.signedVolumeQuery.insideOutside({ x: 10, y: 23, z: 30 }), "outside");
  const hit = instance.query.closestSurface({ x: 10, y: 21, z: 30 });
  assert.ok(hit);
  assert.equal(hit.distance, 0);
  const normal = instance.query.normal({ x: 10, y: 21, z: 30 });
  assert.ok(normal);
  assert.ok(Math.abs(normal.x) < 1e-12);
  assert.ok(Math.abs(normal.y - 1) < 1e-12);
  assert.ok(Math.abs(normal.z) < 1e-12);
  assert.equal(instance.signedVolumeQuery.signedDistance({ x: 10, y: 23, z: 30 }), 2);
});

test("open fixture keeps Surface Host available and Signed Volume unavailable", async () => {
  const open = await createImportedHostSource(asciiStl("open", [cubeTriangles[0]]), {
    filename: "open.stl",
    interpretation,
  });
  const instance = createImportedHostInstance(open, identity);
  assert.equal(instance.capabilities.surfaceCapability.availability, "AVAILABLE");
  assert.equal(instance.capabilities.signedVolumeCapability.availability, "UNAVAILABLE");
  assert.equal(instance.capabilities.signedVolumeCapability.reason, "OPEN_BOUNDARY");
  assert.equal(instance.volumePreflight.boundaryLoops.length, 1);
  assert.equal(instance.volumePreflight.boundaryLoops[0].edgeCount, 3);
  assert.equal(instance.signedVolumeQuery, null);
  assert.ok(instance.query.closestSurface({ x: 1, y: 0, z: 0 }));
});

test("repair proposal and derived provenance never replace original identity", async () => {
  const source = await createImportedHostSource(asciiStl("open", [cubeTriangles[0]]), {
    filename: "open.stl",
    interpretation,
  });
  const instance = createImportedHostInstance(source, identity);
  const proposal = proposeBoundaryRepair(source.sourceIdentity, instance.volumePreflight);
  assert.equal(proposal.active, false);
  assert.equal(proposal.originalSourceSha256, source.sourceIdentity.sha256);
  const bytesBefore = Array.from(new Uint8Array(source.bytes));
  const artifact = createDerivedRepairArtifact(instance.mesh, {
    originalSourceSha256: source.sourceIdentity.sha256,
    repairPolicyVersion: "test-explicit-repair-v0",
    repairParameters: { loopIndices: proposal.boundaryLoopIndices },
    derivedMeshFingerprint: "derived-test-fingerprint",
  });
  assert.equal(artifact.provenance.originalSourceSha256, source.sourceIdentity.sha256);
  assert.deepEqual(Array.from(new Uint8Array(source.bytes)), bytesBefore);
});

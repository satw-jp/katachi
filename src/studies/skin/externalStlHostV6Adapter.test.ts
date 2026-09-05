import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createImportedHostInstance,
  createImportedHostSource,
  type HostSourceInterpretation,
  type HostVec3,
} from "./externalStlHost.ts";
import { createExternalStlHostV6Adapter } from "./externalStlHostV6Adapter.ts";

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

function asciiStl(triangles: readonly Triangle[]): ArrayBuffer {
  const text = [
    "solid cube",
    ...triangles.flatMap(([a, b, c]) => [
      "facet normal 0 0 0",
      "  outer loop",
      `    vertex ${a.x} ${a.y} ${a.z}`,
      `    vertex ${b.x} ${b.y} ${b.z}`,
      `    vertex ${c.x} ${c.y} ${c.z}`,
      "  endloop",
      "endfacet",
    ]),
    "endsolid cube",
    "",
  ].join("\n");
  return new TextEncoder().encode(text).buffer;
}

test("V6 adapter samples the transformed Host deterministically and uses geometric normals", async () => {
  const source = await createImportedHostSource(asciiStl(cubeTriangles), {
    filename: "cube.stl",
    interpretation,
  });
  const instance = createImportedHostInstance(source, {
    translation: { x: 10, y: 20, z: 30 },
    rotation: [0, 0, 0, 1],
    uniformScale: 20,
  });
  const adapter = createExternalStlHostV6Adapter(instance, { seed: "rabbit-golden" });
  const first = adapter.sample(32, 0);
  const second = adapter.sample(32, 0);
  assert.deepEqual(first, second);
  assert.equal(first.length, 32);
  assert.equal(adapter.triangleAreaTotal, 24 * 400);
  for (const candidate of first) {
    assert.ok(Math.abs(candidate.barycentric[0] + candidate.barycentric[1] + candidate.barycentric[2] - 1) < 1e-12);
    assert.ok(candidate.barycentric.every((value) => value >= 0 && value <= 1));
    const normalOffset = candidate.triangleIndex * 3;
    assert.ok(Math.abs(instance.mesh.geometricNormals[normalOffset] - candidate.placementNormal.x) < 1e-12);
    assert.ok(Math.abs(instance.mesh.geometricNormals[normalOffset + 1] - candidate.placementNormal.y) < 1e-12);
    assert.ok(Math.abs(instance.mesh.geometricNormals[normalOffset + 2] - candidate.placementNormal.z) < 1e-12);
    assert.ok(Math.abs(candidate.placementNormal.x * candidate.tangentU.x + candidate.placementNormal.y * candidate.tangentU.y + candidate.placementNormal.z * candidate.tangentU.z) < 1e-12);
    assert.ok(Math.abs(candidate.placementNormal.x * candidate.tangentV.x + candidate.placementNormal.y * candidate.tangentV.y + candidate.placementNormal.z * candidate.tangentV.z) < 1e-12);
  }
  const knownFaceNormal = adapter.geometricNormal({ x: 30, y: 20, z: 30 });
  assert.ok(knownFaceNormal);
  assert.ok(knownFaceNormal.x > 0.999);
  assert.equal(adapter.insideOutside({ x: 10, y: 20, z: 30 }), "inside");
  assert.equal(adapter.insideOutside({ x: 70, y: 20, z: 30 }), "outside");
  assert.ok((adapter.signedDistance({ x: 70, y: 20, z: 30 }) ?? -1) > 0);
});

test("V6 adapter reuses the existing Flower generator and keeps authored motifs stable", async () => {
  const source = await createImportedHostSource(asciiStl(cubeTriangles), {
    filename: "cube.stl",
    interpretation,
  });
  const instance = createImportedHostInstance(source, {
    translation: { x: 0, y: 0, z: 0 },
    rotation: [0, 0, 0, 1],
    uniformScale: 1,
  });
  const adapter = createExternalStlHostV6Adapter(instance, { seed: "stable" });
  const candidate = adapter.sample(1)[0];
  const motifA = adapter.placeFlower(candidate, undefined, 0.2, 101);
  const motifB = adapter.placeFlower(candidate, undefined, 0.2, 101);
  assert.deepEqual(motifA.points, motifB.points);
  assert.equal(motifA.shape, "flower");
  assert.equal(motifA.source, "existing-v6-flower-generator");
  assert.equal(motifA.placementNormalPolicy, "GEOMETRIC");
  assert.equal(motifA.authoredHostTransform.uniformScale, 1);
  assert.ok(motifA.points.length >= 4);
  assert.ok(motifA.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z) && point.r > 0));
});

test("V6 adapter enforces clearance without changing the deterministic candidate order", async () => {
  const source = await createImportedHostSource(asciiStl(cubeTriangles), {
    filename: "cube.stl",
    interpretation,
  });
  const instance = createImportedHostInstance(source, {
    translation: { x: 0, y: 0, z: 0 },
    rotation: [0, 0, 0, 1],
    uniformScale: 20,
  });
  const adapter = createExternalStlHostV6Adapter(instance, { seed: "clearance" });
  const candidates = adapter.sample(12, 8);
  assert.equal(candidates.length, 12);
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const dx = candidates[left].position.x - candidates[right].position.x;
      const dy = candidates[left].position.y - candidates[right].position.y;
      const dz = candidates[left].position.z - candidates[right].position.z;
      assert.ok(Math.hypot(dx, dy, dz) >= 8);
    }
  }
});

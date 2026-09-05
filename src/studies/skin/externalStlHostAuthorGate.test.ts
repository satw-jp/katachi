import assert from "node:assert/strict";
import { test } from "node:test";
import { createImportedHostInstance, createImportedHostSource, type HostSourceInterpretation, type HostVec3 } from "./externalStlHost.ts";
import { createExternalStlHostV6Adapter } from "./externalStlHostV6Adapter.ts";
import { generateAuthorGateMotifs } from "./externalStlHostAuthorGate.ts";

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
  return new TextEncoder().encode([
    "solid cube",
    ...triangles.flatMap(([a, b, c]) => [
      "facet normal 0 0 0", "  outer loop", `    vertex ${a.x} ${a.y} ${a.z}`, `    vertex ${b.x} ${b.y} ${b.z}`, `    vertex ${c.x} ${c.y} ${c.z}`, "  endloop", "endfacet",
    ]),
    "endsolid cube", "",
  ].join("\n")).buffer;
}

async function makeAdapter() {
  const source = await createImportedHostSource(asciiStl(cubeTriangles), { filename: "cube.stl", interpretation });
  return createExternalStlHostV6Adapter(createImportedHostInstance(source, { translation: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], uniformScale: 20 }), { seed: "author-gate" });
}

test("Author Gate motif generation is deterministic and varies size around the host anchor", async () => {
  const adapter = await makeAdapter();
  const options = { sizeMode: "varied" as const, baseSize: 2.4, sizeVariance: 0.35, minimumClearance: 0 };
  const first = generateAuthorGateMotifs(adapter, 32, options);
  const second = generateAuthorGateMotifs(adapter, 32, options);
  assert.deepEqual(first, second);
  const meanRadii = first.map((motif) => motif.points.reduce((sum, point) => sum + point.r, 0) / motif.points.length);
  assert.ok(Math.max(...meanRadii) > Math.min(...meanRadii));
  const uniform = generateAuthorGateMotifs(adapter, 32, { ...options, sizeMode: "uniform" });
  const uniformRadii = uniform.map((motif) => motif.points.reduce((sum, point) => sum + point.r, 0) / motif.points.length);
  assert.equal(Math.max(...uniformRadii) - Math.min(...uniformRadii), 0);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createImportedHostInstance,
  createImportedHostSource,
  type HostSourceInterpretation,
} from "./externalStlHost.ts";

const interpretation: HostSourceInterpretation = {
  unitStatus: "explicit",
  mmPerSourceUnit: 1,
  upAxis: "y",
  handedness: "right",
  importPolicyVersion: "stl-host-v0",
};

const asciiTriangle = `solid triangle
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 2 0 0
    vertex 0 2 0
  endloop
endfacet
endsolid triangle
`;

function binaryTriangle(): ArrayBuffer {
  const bytes = new ArrayBuffer(84 + 50);
  const view = new DataView(bytes);
  const header = new TextEncoder().encode("binary fixture");
  new Uint8Array(bytes).set(header);
  view.setUint32(80, 1, true);
  view.setFloat32(84 + 12, 0, true);
  view.setFloat32(84 + 16, 0, true);
  view.setFloat32(84 + 20, 0, true);
  view.setFloat32(84 + 24, 2, true);
  view.setFloat32(84 + 28, 0, true);
  view.setFloat32(84 + 32, 0, true);
  view.setFloat32(84 + 36, 0, true);
  view.setFloat32(84 + 40, 2, true);
  view.setFloat32(84 + 44, 0, true);
  return bytes;
}

const identity = {
  translation: { x: 0, y: 0, z: 0 },
  rotation: [0, 0, 0, 1] as const,
  uniformScale: 1,
};

test("ASCII STL retains exact bytes and parses as a derived triangle mesh", async () => {
  const bytes = new TextEncoder().encode(asciiTriangle).buffer;
  const source = await createImportedHostSource(bytes, { filename: "triangle-a.stl", interpretation });
  assert.equal(source.format, "ascii-stl");
  assert.deepEqual(Array.from(new Uint8Array(source.bytes)), Array.from(new Uint8Array(bytes)));
  const mesh = source.parseMesh();
  assert.equal(mesh.triangleCount, 1);
  assert.deepEqual(mesh.bounds.min, { x: 0, y: 0, z: 0 });
  assert.deepEqual(mesh.bounds.max, { x: 2, y: 2, z: 0 });
});

test("binary STL parses through STLLoader without changing source bytes", async () => {
  const bytes = binaryTriangle();
  const source = await createImportedHostSource(bytes, { filename: "triangle-b.stl", interpretation });
  assert.equal(source.format, "binary-stl");
  assert.deepEqual(Array.from(new Uint8Array(source.bytes)), Array.from(new Uint8Array(bytes)));
  assert.equal(source.parseMesh().triangleCount, 1);
});

test("same bytes share identity across filename and interpretation changes", async () => {
  const bytes = new TextEncoder().encode(asciiTriangle).buffer;
  const sourceA = await createImportedHostSource(bytes, { filename: "first.stl", interpretation });
  const sourceB = await createImportedHostSource(bytes, {
    filename: "renamed.stl",
    interpretation: { ...interpretation, mmPerSourceUnit: 2 },
  });
  assert.equal(sourceA.sourceIdentity.sha256, sourceB.sourceIdentity.sha256);
  assert.equal(sourceA.sourceIdentity.byteLength, sourceB.sourceIdentity.byteLength);
  assert.equal(sourceA.parseMesh().bounds.max.x, 2);
  assert.equal(sourceB.parseMesh().bounds.max.x, 4);
  assert.deepEqual(
    Array.from(sourceA.parseMesh().positions),
    Array.from((await createImportedHostSource(bytes, { filename: "third.stl", interpretation })).parseMesh().positions),
  );
});

test("changed source bytes receive a different identity", async () => {
  const sourceA = await createImportedHostSource(new TextEncoder().encode(asciiTriangle), {
    filename: "triangle.stl",
    interpretation,
  });
  const sourceB = await createImportedHostSource(new TextEncoder().encode(asciiTriangle.replace("2 0 0", "3 0 0")), {
    filename: "triangle.stl",
    interpretation,
  });
  assert.notEqual(sourceA.sourceIdentity.sha256, sourceB.sourceIdentity.sha256);
});

test("closestSurface returns face, edge, and vertex cases deterministically", async () => {
  const source = await createImportedHostSource(new TextEncoder().encode(asciiTriangle), {
    filename: "triangle.stl",
    interpretation,
  });
  const query = createImportedHostInstance(source, identity).query;
  const face = query.closestSurface({ x: 0.5, y: 0.5, z: 3 });
  assert.ok(face);
  assert.equal(face.distance, 3);
  assert.deepEqual(face.position, { x: 0.5, y: 0.5, z: 0 });
  assert.deepEqual(face.barycentric, [0.5, 0.25, 0.25]);
  assert.deepEqual(face.geometricNormal, { x: 0, y: 0, z: 1 });

  const edge = query.closestSurface({ x: 1, y: -1, z: 0 });
  assert.ok(edge);
  assert.deepEqual(edge.position, { x: 1, y: 0, z: 0 });
  assert.equal(edge.distance, 1);

  const vertex = query.closestSurface({ x: -1, y: -1, z: 0 });
  assert.ok(vertex);
  assert.deepEqual(vertex.position, { x: 0, y: 0, z: 0 });
  assert.equal(vertex.distance, Math.sqrt(2));
});

test("raycast is auxiliary and returns the compatible hit shape", async () => {
  const source = await createImportedHostSource(new TextEncoder().encode(asciiTriangle), {
    filename: "triangle.stl",
    interpretation,
  });
  const hit = createImportedHostInstance(source, identity).query.raycast({
    origin: { x: 0.5, y: 0.5, z: 3 },
    direction: { x: 0, y: 0, z: -2 },
  });
  assert.ok(hit);
  assert.equal(hit.distance, 3);
  assert.equal(hit.triangleIndex, 0);
  assert.deepEqual(hit.barycentric, [0.5, 0.25, 0.25]);
});

test("source interpretation and instance transform remain separate", async () => {
  const source = await createImportedHostSource(new TextEncoder().encode(asciiTriangle), {
    filename: "triangle.stl",
    interpretation: { ...interpretation, mmPerSourceUnit: 2 },
  });
  const instance = createImportedHostInstance(source, {
    translation: { x: 10, y: 20, z: 30 },
    rotation: [0, 0, 0, 1],
    uniformScale: 3,
  });
  assert.deepEqual(instance.source.parseMesh().bounds.max, { x: 4, y: 4, z: 0 });
  assert.deepEqual(instance.mesh.bounds.min, { x: 10, y: 20, z: 30 });
  assert.deepEqual(instance.mesh.bounds.max, { x: 22, y: 32, z: 30 });
});

test("instance rotation is explicit and applied after source interpretation", async () => {
  const source = await createImportedHostSource(new TextEncoder().encode(asciiTriangle), {
    filename: "triangle.stl",
    interpretation,
  });
  const half = Math.sqrt(0.5);
  const instance = createImportedHostInstance(source, {
    translation: { x: 10, y: 20, z: 30 },
    rotation: [0, 0, half, half],
    uniformScale: 1,
  });
  assert.deepEqual(instance.mesh.bounds.min, { x: 8, y: 20, z: 30 });
  assert.deepEqual(instance.mesh.bounds.max, { x: 10, y: 22, z: 30 });
});

test("unresolved units cannot activate a metric Host", async () => {
  const source = await createImportedHostSource(new TextEncoder().encode(asciiTriangle), {
    filename: "unresolved.stl",
    interpretation: {
      unitStatus: "unresolved",
      upAxis: "y",
      handedness: "right",
      importPolicyVersion: "stl-host-v0",
    },
  });
  assert.throws(() => source.parseMesh(), /unresolved Host units/);
});

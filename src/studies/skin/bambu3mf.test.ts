import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bambu3mfExportRequest } from "./bambu3mfWorkerProtocol.ts";
import { filterSupportEnforcerReachability } from "./supportReachability.ts";
import { DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS } from "./externalScaffold.ts";
import {
  buildBambu3mf,
  buildBambu3mfPackageEntries,
  buildSupportEnforcerTriangleSoup,
  indexTriangleSoup,
  parseBinaryStlPositions,
  scaleTriangleSoup,
  supportEnforcerPositionsForDiagnosis,
} from "./bambu3mf.ts";

const ONE_TRIANGLE = new Float32Array([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
]);

function textEntry(entries: Array<{ name: string; data: Uint8Array }>, name: string): string {
  const entry = entries.find((candidate) => candidate.name === name);
  assert.ok(entry, `${name} must exist`);
  return new TextDecoder().decode(entry.data);
}

test("indexTriangleSoup shares exact vertices and removes collapsed faces", () => {
  const positions = new Float32Array([
    ...ONE_TRIANGLE,
    0, 0, 0, 0, 1, 0, 1, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 1, 0,
  ]);
  const mesh = indexTriangleSoup(positions);
  assert.equal(mesh.vertices.length / 3, 3);
  assert.equal(mesh.indices.length / 3, 2);
  assert.equal(mesh.removedDegenerateTriangles, 1);
});

test("support enforcer is a closed eight-face prism that straddles the diagnosed face", () => {
  const positions = buildSupportEnforcerTriangleSoup(ONE_TRIANGLE, {
    marginMm: 0,
    outsideDepthMm: 0.35,
    insideDepthMm: 0.55,
  });
  assert.equal(positions.length / 9, 8);
  const zValues = Array.from(positions).filter((_, index) => index % 3 === 2);
  assert.ok(Math.abs(Math.max(...zValues) - 0.35) < 1e-6);
  assert.ok(Math.abs(Math.min(...zValues) + 0.55) < 1e-6);
  const indexed = indexTriangleSoup(positions);
  const edgeUse = new Map<string, number>();
  for (let offset = 0; offset < indexed.indices.length; offset += 3) {
    const ids = [indexed.indices[offset], indexed.indices[offset + 1], indexed.indices[offset + 2]];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
      const key = ids[a] < ids[b] ? `${ids[a]}:${ids[b]}` : `${ids[b]}:${ids[a]}`;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }
  assert.ok([...edgeUse.values()].every((count) => count === 2));
});

test("Support Enforcer keeps finite tiny faces and omits exact-zero faces", () => {
  const tiny = new Float32Array([0, 0, 1, 1e-11, 0, 1, 0, 1e-11, 1]);
  const exactZero = new Float32Array([0, 0, 2, 1e-11, 0, 2, 2e-11, 0, 2]);
  const mixed = buildSupportEnforcerTriangleSoup(new Float32Array([...ONE_TRIANGLE, ...tiny, ...exactZero]));
  assert.equal(mixed.length / 9, 16);
  assert.equal(indexTriangleSoup(mixed).indices.length / 3, 16);
  assert.equal(buildSupportEnforcerTriangleSoup(exactZero).length, 0);
});

test("Bambu package assigns BODY and Support Enforcer as parts of one object", () => {
  const enforcer = buildSupportEnforcerTriangleSoup(ONE_TRIANGLE);
  const { entries, stats } = buildBambu3mfPackageEntries([
    { name: "BODY", role: "body", positions: ONE_TRIANGLE },
    { name: "SUPPORT_ENFORCER", role: "support_enforcer", positions: enforcer },
  ], { title: "Katachi test", supportType: "normal(manual)", date: "2026-08-22" });
  const root = textEntry(entries, "3D/3dmodel.model");
  const settings = textEntry(entries, "Metadata/model_settings.config");
  const submodel = textEntry(entries, "3D/Objects/object_1.model");
  assert.match(root, /object id="3"/);
  assert.match(root, /component p:path="\/3D\/Objects\/object_1\.model" objectid="1"/);
  assert.match(root, /component p:path="\/3D\/Objects\/object_1\.model" objectid="2"/);
  assert.match(settings, /<object id="3">/);
  assert.match(settings, /<part id="1" subtype="normal_part">/);
  assert.match(settings, /<part id="2" subtype="support_enforcer">/);
  assert.match(settings, /key="enable_support" value="1"/);
  assert.match(settings, /key="support_type" value="normal\(manual\)"/);
  assert.match(settings, /key="support_style" value="snug"/);
  assert.match(settings, /key="support_on_build_plate_only" value="1"/);
  assert.match(settings, /key="support_expansion" value="0"/);
  assert.match(submodel, /<object id="1"[^>]+type="model">/);
  assert.match(submodel, /<object id="2"[^>]+type="other">/);
  assert.equal(stats.bodyFaces, 1);
  assert.equal(stats.enforcerFaces, 8);
});

test("printable external scaffold can merge into one normal BODY part and disables Bambu automatic support", () => {
  const { entries, stats } = buildBambu3mfPackageEntries([
    { name: "BODY", role: "body", positions: ONE_TRIANGLE },
    { name: "EXTERNAL_SCAFFOLD", role: "printable_support", positions: ONE_TRIANGLE },
  ], { title: "Katachi scaffold", supportType: "normal(manual)", date: "2026-08-23", mergePrintableSupportIntoBody: true });
  const settings = textEntry(entries, "Metadata/model_settings.config");
  const submodel = textEntry(entries, "3D/Objects/object_1.model");
  assert.match(settings, /<part id="1" subtype="normal_part">/);
  assert.doesNotMatch(settings, /<part id="2"/);
  assert.match(settings, /key="name" value="BODY_WITH_SCAFFOLD"/);
  assert.match(settings, /key="enable_support" value="0"/);
  assert.doesNotMatch(settings, /key="support_type"/);
  assert.doesNotMatch(settings, /key="support_style"/);
  assert.match(submodel, /<object id="1"[^>]+type="model">/);
  assert.doesNotMatch(submodel, /<object id="2"/);
  assert.equal(stats.bodyFaces, 1);
  assert.equal(stats.scaffoldFaces, 1);
  assert.equal(stats.enforcerFaces, 0);
});

test("SKIN REBUILD keeps artwork and printable support as two parts in one 3MF", () => {
  const { entries, stats } = buildBambu3mfPackageEntries([
    { name: "SKIN_REBUILD_ARTWORK", role: "body", positions: ONE_TRIANGLE },
    { name: "SKIN_REBUILD_PRINT_SUPPORT", role: "printable_support", positions: ONE_TRIANGLE },
  ], {
    title: "SKIN REBUILD separate output",
    supportType: "normal(manual)",
    date: "2026-08-30",
    mergePrintableSupportIntoBody: false,
  });
  const root = textEntry(entries, "3D/3dmodel.model");
  const settings = textEntry(entries, "Metadata/model_settings.config");
  const submodel = textEntry(entries, "3D/Objects/object_1.model");
  assert.match(root, /artwork and printable support as separate parts/);
  assert.match(root, /object id="3"/);
  assert.match(settings, /<part id="1" subtype="normal_part">/);
  assert.match(settings, /key="name" value="SKIN_REBUILD_ARTWORK"/);
  assert.match(settings, /<part id="2" subtype="normal_part">/);
  assert.match(settings, /key="name" value="SKIN_REBUILD_PRINT_SUPPORT"/);
  assert.match(settings, /key="enable_support" value="0"/);
  assert.match(submodel, /<object id="1"[^>]+type="model">/);
  assert.match(submodel, /<object id="2"[^>]+type="model">/);
  assert.equal(stats.bodyFaces, 1);
  assert.equal(stats.scaffoldFaces, 1);
});

test("separate 3MF placement uses the shared BODY and support Z extent", () => {
  const atZ = (positions: Float32Array, z: number): Float32Array => {
    const shifted = positions.slice();
    for (let index = 2; index < shifted.length; index += 3) shifted[index] += z;
    return shifted;
  };
  const { entries } = buildBambu3mfPackageEntries([
    { name: "SKIN_REBUILD_ARTWORK", role: "body", positions: atZ(ONE_TRIANGLE, 10) },
    { name: "SKIN_REBUILD_PRINT_SUPPORT", role: "printable_support", positions: atZ(ONE_TRIANGLE, -2) },
  ], {
    title: "shared Z coordinates",
    supportType: "normal(manual)",
    date: "2026-08-30",
    mergePrintableSupportIntoBody: false,
  });
  const root = textEntry(entries, "3D/3dmodel.model");
  assert.match(
    root,
    /transform="1 0 0 0 1 0 0 0 1 89\.5 89\.5 2" printable="1"/,
    "the grouped instance must put the lowest part, not BODY alone, on the plate",
  );
});

test("porous SKIN export rejects unsafe Tree routing", () => {
  assert.throws(() => buildBambu3mfPackageEntries([
    { name: "BODY", role: "body", positions: ONE_TRIANGLE },
    { name: "SUPPORT_ENFORCER", role: "support_enforcer", positions: buildSupportEnforcerTriangleSoup(ONE_TRIANGLE) },
  ], { title: "unsafe tree", supportType: "tree(manual)" as never }), /Tree support/);
});

test("Internal uses only the danger remaining after fusion for Support Enforcer", () => {
  const before = new Float32Array(18);
  const after = new Float32Array(9);
  assert.equal(supportEnforcerPositionsForDiagnosis(before, after, 0), before);
  assert.equal(supportEnforcerPositionsForDiagnosis(before, after, 823), after);
});

test("binary STL parsing and source scaling keep BODY and diagnosis aligned", () => {
  const stl = new ArrayBuffer(84 + 50);
  const view = new DataView(stl);
  view.setUint32(80, 1, true);
  let offset = 96;
  for (const value of ONE_TRIANGLE) { view.setFloat32(offset, value * 2, true); offset += 4; }
  assert.deepEqual(Array.from(parseBinaryStlPositions(stl)), Array.from(scaleTriangleSoup(ONE_TRIANGLE, 2)));
});

test("generated 3MF is a ZIP archive with compressed package entries", async () => {
  const enforcer = buildSupportEnforcerTriangleSoup(ONE_TRIANGLE);
  const result = await buildBambu3mf([
    { name: "BODY", role: "body", positions: ONE_TRIANGLE },
    { name: "SUPPORT_ENFORCER", role: "support_enforcer", positions: enforcer },
  ], { title: "Katachi test", supportType: "normal(manual)", date: "2026-08-22" });
  const view = new DataView(result.archive);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(result.archive.byteLength - 22, true), 0x06054b50);
  assert.equal(view.getUint16(result.archive.byteLength - 12, true), 6);
  assert.ok(result.stats.archiveBytes > 0);
});
test("worker request always carries the exact Surface occlusion soup and exposes filter facts", () => {
  const request: Bambu3mfExportRequest = {
    type: "export", requestId: 1, generation: 1, finalSurfacePositions: ONE_TRIANGLE,
    dangerousPositions: ONE_TRIANGLE, scaleMmPerUnit: 1, scaffoldOptions: { ...DEFAULT_EXTERNAL_SCAFFOLD_OPTIONS },
    supportType: "normal(manual)", title: "contract", generatorVersion: "0.66.0",
  };
  assert.equal(request.finalSurfacePositions, ONE_TRIANGLE);
  const reachability = filterSupportEnforcerReachability(request.dangerousPositions, request.finalSurfacePositions);
  assert.equal(reachability.keptFaceCount, 1);
  assert.equal(reachability.rejectedFaceCount, 0);
  assert.ok(reachability.lowerIntersectionEpsilonMm > 0);
});

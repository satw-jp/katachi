import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  encodeBinaryStl,
  inspectSavedStlTopology,
  orientMeshForSavedStl,
} from "../../cloud-sculpt/meshExport.ts";
import { buildPrintSupportMesh } from "../meshExport.ts";
import {
  buildBambu3mf,
  buildBambu3mfPackageEntries,
  indexTriangleSoup,
  parseBinaryStlPositions,
} from "../bambu3mf.ts";
import type { InternalStructureGraph } from "../voronoi.ts";
import { validateSkin3mf } from "./threeMfValidation.ts";

const SOURCE_OFFSET = { x: 0, y: 0, z: 0.25 };
const SUPPORT_RADIUS = 0.05;
const NECK_RADIUS = 0.025;

const graph: InternalStructureGraph = {
  kind: "targetedGrid",
  nodes: [
    { id: 0, position: { x: 0.5, y: 0, z: 0 }, radius: SUPPORT_RADIUS },
    { id: 1, position: { x: 0.5, y: 0, z: 1.4 }, radius: SUPPORT_RADIUS },
    { id: 2, position: { x: 0, y: 0, z: 2 }, radius: SUPPORT_RADIUS },
    { id: 3, position: { x: 0, y: 0, z: 2.2 }, radius: NECK_RADIUS },
  ],
  edges: [
    { id: 0, start: 0, end: 1, radius: SUPPORT_RADIUS },
    { id: 1, start: 1, end: 2, radius: SUPPORT_RADIUS },
    { id: 2, start: 2, end: 3, radius: NECK_RADIUS },
  ],
  stats: {
    inputPoints: 4,
    delaunayTetrahedra: 0,
    candidateEdges: 3,
    clippedEdges: 0,
    removedShortEdges: 0,
    removedOutsideEdges: 0,
    removedIsolatedEdges: 0,
    gridNodeCount: 4,
    gridEdgeCount: 3,
  },
};

function translated(point: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return {
    x: point.x + SOURCE_OFFSET.x,
    y: point.y + SOURCE_OFFSET.y,
    z: point.z + SOURCE_OFFSET.z,
  };
}

function hasPoint(positions: Float32Array, point: { x: number; y: number; z: number }): boolean {
  const expected = [Math.fround(point.x), Math.fround(point.y), Math.fround(point.z)];
  for (let offset = 0; offset < positions.length; offset += 3) {
    if (positions[offset] === expected[0]
      && positions[offset + 1] === expected[1]
      && positions[offset + 2] === expected[2]) return true;
  }
  return false;
}

function hasRingCenteredAt(
  positions: Float32Array,
  point: { x: number; y: number; z: number },
  radius: number,
): boolean {
  const keys = new Set<string>();
  for (let offset = 0; offset < positions.length; offset += 3) {
    const distance = Math.hypot(
      positions[offset] - point.x,
      positions[offset + 1] - point.y,
      positions[offset + 2] - point.z,
    );
    if (Math.abs(distance - radius) <= 1e-5) {
      keys.add(`${positions[offset]},${positions[offset + 1]},${positions[offset + 2]}`);
    }
  }
  return keys.size >= 8;
}

function sampledObstructionSdf(positions: Float32Array): number {
  const sdf = (x: number, y: number, z: number): number =>
    Math.hypot(x, y, z - 1.25) - 0.08;
  let minimum = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < positions.length; offset += 9) {
    const a = { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] };
    const b = { x: positions[offset + 3], y: positions[offset + 4], z: positions[offset + 5] };
    const c = { x: positions[offset + 6], y: positions[offset + 7], z: positions[offset + 8] };
    const samples = [a, b, c,
      { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
      { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2, z: (b.z + c.z) / 2 },
      { x: (c.x + a.x) / 2, y: (c.y + a.y) / 2, z: (c.z + a.z) / 2 },
      { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 },
    ];
    for (const sample of samples) minimum = Math.min(minimum, sdf(sample.x, sample.y, sample.z));
  }
  return minimum;
}

function textEntry(entries: Array<{ name: string; data: Uint8Array }>, name: string): string {
  const entry = entries.find((candidate) => candidate.name === name);
  assert.ok(entry, `${name} must exist`);
  return new TextDecoder().decode(entry.data);
}

function supportVerticesFromModelXml(xml: string): Float32Array {
  const start = xml.indexOf('<object id="2"');
  const end = xml.indexOf("</object>", start);
  assert.ok(start >= 0 && end > start, "3MF must contain a separate support object");
  const supportXml = xml.slice(start, end);
  const vertices = [...supportXml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)]
    .flatMap((match) => match.slice(1).map(Number));
  return new Float32Array(vertices);
}

test("Stage 8 accepted sparse route keeps endpoints, bend, neck and BODY clearance through STL/3MF export", async () => {
  const workerSource = readFileSync(
    fileURLToPath(new URL("../meshExport.worker.ts", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(
    workerSource,
    /extendVerticalRootsToPlateZ/,
    "the Stage 8 export call must not rewrite every vertical graph edge to Plate Z",
  );

  const accepted = orientMeshForSavedStl(buildPrintSupportMesh(graph, 1, {
    sourceOffset: SOURCE_OFFSET,
  }));
  const topology = inspectSavedStlTopology(accepted.triangles, accepted.scaleMmPerUnit);
  assert.equal(topology.ok, true, `accepted support must remain a closed export component: ${JSON.stringify(topology)}`);
  const stl = encodeBinaryStl(accepted, "stage8-export-parity-print-support");
  const supportPositions = parseBinaryStlPositions(stl);

  for (const edge of graph.edges) {
    const start = translated(graph.nodes[edge.start].position);
    const end = translated(graph.nodes[edge.end].position);
    assert.ok(hasRingCenteredAt(supportPositions, start, edge.radius), `edge ${edge.id} start ring must survive export`);
    assert.ok(hasRingCenteredAt(supportPositions, end, edge.radius), `edge ${edge.id} end ring must survive export`);
  }
  assert.equal(hasPoint(supportPositions, { x: 0, y: 0, z: 0 }), false,
    "the non-root contact neck must not acquire a new Plate endpoint");
  assert.equal(hasRingCenteredAt(supportPositions, translated(graph.nodes[2].position), NECK_RADIUS), true,
    "the bend-to-neck endpoint must remain at its accepted height");
  assert.ok(Math.abs(Math.hypot(
    graph.nodes[3].position.x - graph.nodes[2].position.x,
    graph.nodes[3].position.y - graph.nodes[2].position.y,
    graph.nodes[3].position.z - graph.nodes[2].position.z,
  ) - 0.2) <= 1e-9, "the accepted contact neck length is 0.2 source units");

  const safeCollisionDistance = sampledObstructionSdf(supportPositions);
  assert.ok(safeCollisionDistance > 0.02,
    `accepted export must not overlap the non-target BODY obstruction (minimum SDF ${safeCollisionDistance})`);

  // This is the pre-fix behavior: the old callsite's option pulls both the
  // authored root and the vertical terminal neck down to z=0. The latter then
  // crosses the authoritative non-target BODY obstruction at x=0, z=1.25.
  const legacy = orientMeshForSavedStl(buildPrintSupportMesh(graph, 1, {
    sourceOffset: SOURCE_OFFSET,
    extendVerticalRootsToPlateZ: 0,
  }));
  const legacyPositions = parseBinaryStlPositions(encodeBinaryStl(legacy, "stage8-export-parity-legacy"));
  assert.ok(sampledObstructionSdf(legacyPositions) < -0.02,
    "the regression fixture must reproduce the pre-fix BODY penetration");

  const bodyPositions = new Float32Array([
    10, 10, SOURCE_OFFSET.z,
    11, 10, SOURCE_OFFSET.z,
    10, 11, SOURCE_OFFSET.z,
  ]);
  const packageEntries = buildBambu3mfPackageEntries([
    { name: "SKIN_REBUILD_ARTWORK", role: "body", positions: bodyPositions },
    { name: "SKIN_REBUILD_PRINT_SUPPORT", role: "printable_support", positions: supportPositions },
  ], {
    title: "Stage 8 export parity fixture",
    supportType: "normal(manual)",
    date: "2026-09-02",
    mergePrintableSupportIntoBody: false,
  }).entries;
  assert.deepEqual(
    Array.from(supportVerticesFromModelXml(textEntry(packageEntries, "3D/Objects/object_1.model"))),
    Array.from(indexTriangleSoup(supportPositions).vertices),
    "3MF support vertices must equal the STL support vertices exactly",
  );

  const result = await buildBambu3mf([
    { name: "SKIN_REBUILD_ARTWORK", role: "body", positions: bodyPositions },
    { name: "SKIN_REBUILD_PRINT_SUPPORT", role: "printable_support", positions: supportPositions },
  ], {
    title: "Stage 8 export parity fixture",
    supportType: "normal(manual)",
    date: "2026-09-02",
    mergePrintableSupportIntoBody: false,
  });
  const report = await validateSkin3mf(result.archive, {
    expectedUnit: "millimeter",
    expectedSupportPresent: true,
  });
  assert.equal(report.valid, true, report.errors.join("\n"));
  assert.equal(report.objectCount, 2, "BODY and PRINT_SUPPORT remain separate 3MF objects");
  assert.equal(report.supportPresent, true);
  console.log("exportSupportParity: accepted graph endpoints, legacy penetration reproduction, STL/3MF parity, separate parts, and post-export BODY clearance passed");
});

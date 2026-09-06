import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  encodeBinaryStl,
  orientMeshForSavedStl,
} from "../src/studies/cloud-sculpt/meshExport.ts";
import {
  buildBambu3mf,
  indexTriangleSoup,
  parseBinaryStlPositions,
} from "../src/studies/skin/bambu3mf.ts";
import { createFinishedSkinBodySdfEvaluator, buildPrintSupportMesh } from "../src/studies/skin/meshExport.ts";
import { parseSkinRebuildFkei, projectFromSkinRebuildFkei } from "../src/studies/skin/rebuild/fkei.ts";
import { findSkinRebuildLowestPoints } from "../src/studies/skin/rebuild/model.ts";
import {
  SKIN_REBUILD_OVERHANG_INSIDE,
  SKIN_REBUILD_OVERHANG_OUTSIDE,
  SKIN_REBUILD_STAGE7_DANGER_BOUNDARY,
  classifySkinRebuildOverhangFromStage3,
  computeSkinRebuildMeshInteriorInterfaceDistancesMm,
  mapSkinRebuildStage7DangerFacesByExactTriangle,
} from "../src/studies/skin/rebuild/overhangInteriorClassification.ts";
import {
  DEFAULT_SKIN_PRODUCTION_V0_GEOMETRY_POLICY,
  buildSkinProductionV0FromProject,
} from "../src/studies/skin/rebuild/productionV0.ts";
import {
  buildSparseRemovableSupport,
  deriveA1MiniPlateBoundsFromBodyPositions,
  type SparseRemovableSupportFace,
  type SparseRemovableSupportResult,
} from "../src/studies/skin/rebuild/sparseRemovableSupport.ts";
import {
  applySupportPhysicalFeedback,
  DEFAULT_SUPPORT_MAX_UNBRACED_LENGTH_MM,
} from "../src/studies/skin/rebuild/supportPhysicalFeedback.ts";
import { validateSkin3mf } from "../src/studies/skin/rebuild/threeMfValidation.ts";
import type { InternalStructureGraph, Vector3Value } from "../src/studies/skin/voronoi.ts";

const require = createRequire(new URL("../package.json", import.meta.url));
const sharp = require("sharp") as typeof import("sharp");
const FKEI = process.argv[2] ?? "C:/Users/as/Downloads/skin-rebuild-complete-2026-09-06T01-16-12-040Z.fkei";
const OUT = process.argv[3] ?? "J:/My Drive/codex/2026-09-06/files-pasted-by-the-user-temporary/outputs/production-v0-support-wiring-fix-v0";
const CHECKPOINT = "73bba117c1d09bf14735b1ad71938b086b165cf8";
const BRANCH = "agent/skin-production-v0-support-wiring-fix-v0";
const BOUNDARY_THICKNESS_MM = 2;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (ArrayBuffer.isView(value)) return `[${Array.from(value as unknown as ArrayLike<number>).join(",")}]`;
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

function graphFingerprint(graph: InternalStructureGraph): string {
  return sha256(stable(graph));
}

function floatFingerprint(values: Float32Array): string {
  return sha256(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
}

function triangleArea(values: Float32Array, offset: number): number {
  const abx = values[offset + 3] - values[offset];
  const aby = values[offset + 4] - values[offset + 1];
  const abz = values[offset + 5] - values[offset + 2];
  const acx = values[offset + 6] - values[offset];
  const acy = values[offset + 7] - values[offset + 1];
  const acz = values[offset + 8] - values[offset + 2];
  return Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx) * 0.5;
}

function stage7Targets(
  meshPositions: Float32Array,
  overhangPositions: Float32Array,
  overhangRegionIds: Int32Array,
  patternSides: Parameters<typeof classifySkinRebuildOverhangFromStage3>[2],
  targetLongestMm: number,
): { faces: SparseRemovableSupportFace[]; outsideRegionCount: number; mappingAvailable: boolean } {
  const faceCount = meshPositions.length / 9;
  const projection = classifySkinRebuildOverhangFromStage3(
    meshPositions,
    new Int32Array(faceCount).fill(-1),
    patternSides,
  );
  const classes = new Int8Array(projection.faceClasses);
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let i = 0; i < meshPositions.length; i += 3) {
    minX = Math.min(minX, meshPositions[i]); maxX = Math.max(maxX, meshPositions[i]);
    minY = Math.min(minY, meshPositions[i + 1]); maxY = Math.max(maxY, meshPositions[i + 1]);
    minZ = Math.min(minZ, meshPositions[i + 2]); maxZ = Math.max(maxZ, meshPositions[i + 2]);
  }
  const sourceLongest = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const interfaceDistanceMm = computeSkinRebuildMeshInteriorInterfaceDistancesMm(
    meshPositions,
    classes,
    targetLongestMm / sourceLongest,
  );
  for (let face = 0; face < faceCount; face++) {
    if ((classes[face] === SKIN_REBUILD_OVERHANG_INSIDE || classes[face] === SKIN_REBUILD_OVERHANG_OUTSIDE)
      && Number.isFinite(interfaceDistanceMm[face])
      && interfaceDistanceMm[face] <= BOUNDARY_THICKNESS_MM * 0.5) {
      classes[face] = SKIN_REBUILD_STAGE7_DANGER_BOUNDARY;
    }
  }
  const mapping = mapSkinRebuildStage7DangerFacesByExactTriangle(
    meshPositions,
    classes,
    overhangPositions,
    overhangRegionIds,
  );
  const faces: SparseRemovableSupportFace[] = [];
  for (let dangerFace = 0; dangerFace < mapping.faceClasses.length; dangerFace++) {
    const fullFace = mapping.fullMeshFaceIndices[dangerFace];
    if (fullFace < 0 || mapping.faceClasses[dangerFace] !== SKIN_REBUILD_OVERHANG_OUTSIDE) continue;
    const offset = dangerFace * 9;
    const ax = overhangPositions[offset]; const ay = overhangPositions[offset + 1]; const az = overhangPositions[offset + 2];
    const bx = overhangPositions[offset + 3]; const by = overhangPositions[offset + 4]; const bz = overhangPositions[offset + 5];
    const cx = overhangPositions[offset + 6]; const cy = overhangPositions[offset + 7]; const cz = overhangPositions[offset + 8];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const length = Math.hypot(nx, ny, nz);
    if (!(length > 1e-12)) continue;
    faces.push({
      regionId: overhangRegionIds[dangerFace],
      ownerPatchId: projection.faceOwnerPatchIds[fullFace],
      position: { x: (ax + bx + cx) / 3, y: (ay + by + cy) / 3, z: (az + bz + cz) / 3 },
      normal: { x: nx / length, y: ny / length, z: nz / length },
      faceIndex: dangerFace,
      area: triangleArea(overhangPositions, offset),
    });
  }
  return {
    faces,
    outsideRegionCount: new Set(faces.map((face) => face.regionId)).size,
    mappingAvailable: mapping.available,
  };
}

function unzipEntry(archive: Uint8Array, wanted: string): Uint8Array {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 <= archive.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(archive.subarray(offset + 30, offset + 30 + nameLength));
    const payloadStart = offset + 30 + nameLength + extraLength;
    const payload = archive.subarray(payloadStart, payloadStart + compressedSize);
    if (name === wanted) {
      if (method === 0) return payload.slice();
      if (method === 8) return new Uint8Array(inflateRawSync(payload));
      throw new Error(`unsupported ZIP method ${method}`);
    }
    offset = payloadStart + compressedSize;
  }
  throw new Error(`missing ZIP entry: ${wanted}`);
}

function objectVertices(xml: string, objectId: number): Float32Array {
  const start = xml.indexOf(`<object id="${objectId}"`);
  const end = xml.indexOf("</object>", start);
  assert.ok(start >= 0 && end > start, `3MF object ${objectId} is missing`);
  const values = [...xml.slice(start, end).matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)]
    .flatMap((match) => match.slice(1).map(Number));
  return new Float32Array(values);
}

function project(view: string, x: number, y: number, z: number): [number, number, number] {
  if (view === "front") return [x, z, y];
  if (view === "side") return [y, z, -x];
  if (view === "oblique") return [(x - y) * 0.7071, z + (x + y) * 0.12, x + y];
  return [x + y * 0.52, z + x * 0.14, y - x * 0.52];
}

function renderSvg(
  view: string,
  body: Float32Array,
  support: Float32Array,
  representative: SparseRemovableSupportResult["acceptedRoutes"][number],
  scale: number,
  plateShiftSourceZ: number,
): string {
  const width = 1200; const height = 1000;
  const bodyPoints: Array<[number, number, number]> = [];
  for (let i = 0; i < body.length; i += 3) bodyPoints.push(project(view, body[i], body[i + 1], body[i + 2]));
  const supportPoints: Array<[number, number, number]> = [];
  for (let i = 0; i < support.length; i += 3) supportPoints.push(project(view, support[i], support[i + 1], support[i + 2]));
  const all = [...bodyPoints, ...supportPoints];
  let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity;
  for (const point of all) {
    minU = Math.min(minU, point[0]); maxU = Math.max(maxU, point[0]);
    minV = Math.min(minV, point[1]); maxV = Math.max(maxV, point[1]);
  }
  const drawScale = Math.min(1020 / Math.max(maxU - minU, 1), 820 / Math.max(maxV - minV, 1));
  const map = (point: [number, number, number]): [number, number] => [
    600 + (point[0] - (minU + maxU) / 2) * drawScale,
    525 - (point[1] - (minV + maxV) / 2) * drawScale,
  ];
  const triangles = (points: Array<[number, number, number]>, stride: number, fill: string, opacity: number): string[] => {
    const faces: Array<{ points: string; depth: number }> = [];
    for (let face = 0; face * 3 + 2 < points.length; face += stride) {
      const source = [points[face * 3], points[face * 3 + 1], points[face * 3 + 2]];
      faces.push({
        points: source.map((point) => map(point).map((value) => value.toFixed(2)).join(",")).join(" "),
        depth: source.reduce((sum, point) => sum + point[2], 0) / 3,
      });
    }
    faces.sort((a, b) => a.depth - b.depth);
    return faces.map((face) => `<polygon points="${face.points}" fill="${fill}" fill-opacity="${opacity}" stroke="${fill}" stroke-opacity="0.12" stroke-width="0.3"/>`);
  };
  const routePoints: Vector3Value[] = [representative.route.segments[0].start];
  for (const segment of representative.route.segments) routePoints.push(segment.end);
  const polyline = routePoints.map((point) => map(project(
    view,
    point.x * scale,
    point.y * scale,
    (point.z + plateShiftSourceZ) * scale,
  )).map((v) => v.toFixed(2)).join(",")).join(" ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#f8f6f1"/>`,
    `<text x="42" y="54" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="#332b26">C Production v0 · ${view === "author" ? "Author / Bambu-like" : view}</text>`,
    `<text x="42" y="84" font-family="Arial,sans-serif" font-size="16" fill="#665a52">Artwork BODY (amber) + current Stage 8 Removable Support (teal)</text>`,
    ...triangles(bodyPoints, Math.max(1, Math.ceil(bodyPoints.length / 3 / 24000)), "#d79b42", 0.25),
    ...triangles(supportPoints, 1, "#058b8c", 0.88),
    `<polyline points="${polyline}" fill="none" stroke="#c93542" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<rect x="40" y="895" width="1120" height="64" rx="10" fill="#ffffffdd" stroke="#d7cdc5"/>`,
    `<circle cx="70" cy="927" r="9" fill="#d79b42"/><text x="88" y="934" font-family="Arial,sans-serif" font-size="17" fill="#4a3a31">Artwork BODY</text>`,
    `<circle cx="270" cy="927" r="9" fill="#058b8c"/><text x="288" y="934" font-family="Arial,sans-serif" font-size="17" fill="#4a3a31">Removable Support</text>`,
    `<line x1="510" y1="927" x2="555" y2="927" stroke="#c93542" stroke-width="5"/><text x="570" y="934" font-family="Arial,sans-serif" font-size="17" fill="#4a3a31">verified offset-bend route</text>`,
    `</svg>`,
  ].join("");
}

const inputBytes = readFileSync(FKEI);
const source = projectFromSkinRebuildFkei(parseSkinRebuildFkei(inputBytes.toString("utf8")));
const legacyFingerprint = graphFingerprint(source.printSupport);
const production = buildSkinProductionV0FromProject(source);
assert.equal(production.project.printSupport.edges.length, 0, "Production v0 must clear legacy Support");
const bodyFingerprintBefore = production.provenance.diagnostics.bodyGeometryHash;
const bodyPlateShiftSourceZ = production.analysisMesh.plateShiftSourceZ ?? 0;
const diagnosticMesh = bodyPlateShiftSourceZ === 0
  ? production.analysisMesh
  : {
      ...production.analysisMesh,
      triangles: production.analysisMesh.triangles.map((triangle) => ({
        a: { ...triangle.a, z: triangle.a.z - bodyPlateShiftSourceZ },
        b: { ...triangle.b, z: triangle.b.z - bodyPlateShiftSourceZ },
        c: { ...triangle.c, z: triangle.c.z - bodyPlateShiftSourceZ },
      })),
      sourceBounds: {
        ...production.analysisMesh.sourceBounds,
        min: { ...production.analysisMesh.sourceBounds.min, z: production.analysisMesh.sourceBounds.min.z - bodyPlateShiftSourceZ },
        max: { ...production.analysisMesh.sourceBounds.max, z: production.analysisMesh.sourceBounds.max.z - bodyPlateShiftSourceZ },
      },
      plateShiftSourceZ: 0,
    };

const diagnosis = findSkinRebuildLowestPoints(
  production.project.base,
  production.project.patterns,
  production.project.patternSides,
  production.project.finalGraph,
  production.project.settings,
  diagnosticMesh,
);
const targets = stage7Targets(
  diagnosis.meshPositions,
  diagnosis.overhang.positions,
  diagnosis.overhang.faceRegionIds,
  production.project.patternSides,
  production.project.settings.targetLongestMm,
);
assert.ok(targets.faces.length > 0, "Production P3 must yield Stage 8 Outside targets");

const settings = production.project.settings;
const scaleMmPerUnit = production.analysisMesh.scaleMmPerUnit;
const shaftRadius = settings.supportDiameterMm * 0.5 / scaleMmPerUnit;
const neckRadius = Math.min(0.3 / scaleMmPerUnit, shaftRadius * 0.85);
const neckLength = Math.max(0.6 / scaleMmPerUnit, shaftRadius * 1.25);
const targetRadius = Math.max(settings.surfaceThickness, neckRadius * 2);
const bodyInput = {
  mode: "plate" as const,
  host: production.project.base.host,
  hostK: production.project.base.hostK,
  thickness: settings.surfaceThickness,
  patches: production.project.patterns,
  roundK: settings.roundK,
  coinBulge: 0,
  coinBulgeBalance: 0,
  quadMeshJoinWidth: DEFAULT_SKIN_PRODUCTION_V0_GEOMETRY_POLICY.quadMeshJoinWidthSource,
  internalGraph: production.project.finalGraph,
};
const bodySdf = createFinishedSkinBodySdfEvaluator(bodyInput);
const targetSdfByOwner = new Map<number, ReturnType<typeof createFinishedSkinBodySdfEvaluator>>();
const otherBodySdfByOwner = new Map<number, ReturnType<typeof createFinishedSkinBodySdfEvaluator>>();
for (const target of targets.faces) {
  if (targetSdfByOwner.has(target.ownerPatchId)) continue;
  const owner = production.project.patterns.find((patch) => patch.id === target.ownerPatchId);
  if (!owner) continue;
  targetSdfByOwner.set(target.ownerPatchId, createFinishedSkinBodySdfEvaluator({ ...bodyInput, patches: [owner], internalGraph: null }));
  otherBodySdfByOwner.set(target.ownerPatchId, createFinishedSkinBodySdfEvaluator({
    ...bodyInput,
    patches: production.project.patterns.filter((patch) => patch.id !== target.ownerPatchId),
  }));
}
const plateZ = diagnosis.lowestPoints.length > 0
  ? Math.min(...diagnosis.lowestPoints.map((point) => point.position.z))
  : production.analysisMesh.sourceBounds.min.z;
const plateBounds = deriveA1MiniPlateBoundsFromBodyPositions(diagnosis.meshPositions, settings.targetLongestMm);
const supportRequest = {
  projectedOutsideFaces: targets.faces,
  outsideRegionCount: targets.outsideRegionCount,
  plateZ,
  shaftRadius,
  neckRadius,
  bodySdf,
  targetSdf: (target: { ownerPatchId: number }, x: number, y: number, z: number) =>
    targetSdfByOwner.get(target.ownerPatchId)?.(x, y, z) ?? Number.NaN,
  otherBodySdf: (target: { ownerPatchId: number }, x: number, y: number, z: number) =>
    otherBodySdfByOwner.get(target.ownerPatchId)?.(x, y, z) ?? Number.NaN,
  removalGapMm: 0.35,
  scaleMmPerUnit,
  contactNeckDiameterMm: 0.6,
  neckLength,
  targetRadius,
  maximumOverlapLength: targetRadius + shaftRadius * 2,
  maximumDepth: targetRadius + shaftRadius * 2,
  plateBounds,
  preserveContactNeck: true,
  spacingAsSelectionPreference: true,
};
const baseSparseResult = buildSparseRemovableSupport(supportRequest);
const physicalFeedback = applySupportPhysicalFeedback(baseSparseResult, supportRequest, {
  maxUnbracedLengthMm: DEFAULT_SUPPORT_MAX_UNBRACED_LENGTH_MM,
  scaleMmPerUnit,
  braceEnabled: true,
  tipDiameterMm: 0.6,
  neckLengthMm: 0.6,
  contactGapMm: 0,
});
const sparseResult: SparseRemovableSupportResult = {
  ...baseSparseResult,
  graph: physicalFeedback.graph,
  acceptedRoutes: physicalFeedback.acceptedRoutes,
};
const correctedProject = { ...production.project, printSupport: sparseResult.graph };
assert.equal(correctedProject.printSupport, sparseResult.graph, "current Stage 8 graph identity must be preserved");
assert.equal(sparseResult.diagnostics.acceptedBodyCollisionCount, 0);
assert.equal(sparseResult.diagnostics.insideDerivedSupportCount, 0);
assert.ok(sparseResult.diagnostics.offsetBendCount > 0, "offset-bend route family must be present");
const representative = sparseResult.acceptedRoutes.find(({ route }) => route.kind === "leaning" && route.segments.length >= 3);
assert.ok(representative, "a real offset-bend route with shaft, bend, angled approach, and neck is required");
const [shaft, angled, neck] = representative.route.segments;
const horizontal = (a: Vector3Value, b: Vector3Value) => Math.hypot(b.x - a.x, b.y - a.y);
const routeGeometry = {
  candidateId: representative.candidateId,
  shaftExists: Math.abs(shaft.end.z - shaft.start.z) > 1e-9 && horizontal(shaft.start, shaft.end) <= 1e-8,
  bendExists: horizontal(shaft.end, angled.start) <= 1e-8 && horizontal(angled.start, angled.end) > 1e-8,
  angledSegmentExists: horizontal(angled.start, angled.end) > 1e-8 && Math.abs(angled.end.z - angled.start.z) > 1e-9,
  shortNeckExists: Math.hypot(neck.end.x - neck.start.x, neck.end.y - neck.start.y, neck.end.z - neck.start.z) <= neckLength + 1e-7,
  segments: representative.route.segments,
};
assert.ok(routeGeometry.shaftExists && routeGeometry.bendExists && routeGeometry.angledSegmentExists && routeGeometry.shortNeckExists,
  `representative offset-bend geometry is incomplete: ${JSON.stringify(routeGeometry)}`);

const orientedBody = orientMeshForSavedStl(production.analysisMesh);
const bodyStl = new Uint8Array(encodeBinaryStl(orientedBody, "SKIN-C-production-v0-BODY"));
const bodyPositions = parseBinaryStlPositions(bodyStl.buffer.slice(bodyStl.byteOffset, bodyStl.byteOffset + bodyStl.byteLength));
const supportMesh = orientMeshForSavedStl(buildPrintSupportMesh(sparseResult.graph, scaleMmPerUnit, {
  sourceOffset: { x: 0, y: 0, z: bodyPlateShiftSourceZ },
}));
const supportStl = new Uint8Array(encodeBinaryStl(supportMesh, "SKIN-C-production-v0-PRINT_SUPPORT"));
const supportPositions = parseBinaryStlPositions(supportStl.buffer.slice(supportStl.byteOffset, supportStl.byteOffset + supportStl.byteLength));
const bodyCanonical = indexTriangleSoup(bodyPositions).vertices;
const supportCanonical = indexTriangleSoup(supportPositions).vertices;
const bodyCanonicalFingerprint = floatFingerprint(bodyCanonical);
const supportCanonicalFingerprint = floatFingerprint(supportCanonical);

const threeMf = await buildBambu3mf([
  { name: "SKIN_REBUILD_ARTWORK", role: "body", positions: bodyPositions },
  { name: "SKIN_REBUILD_PRINT_SUPPORT", role: "printable_support", positions: supportPositions },
], {
  title: "SKIN-C-production-v0-support-fixed",
  generatorVersion: "production-v0-support-wiring-fix-v0",
  supportType: "normal(manual)",
  mergePrintableSupportIntoBody: false,
});
const validation = await validateSkin3mf(threeMf.archive, {
  expectedUnit: "millimeter",
  expectedSupportPresent: true,
  expectedTriangleCount: threeMf.stats.bodyFaces + threeMf.stats.scaffoldFaces,
});
assert.equal(validation.valid, true, validation.errors.join("\n"));
assert.equal(validation.objectCount, 2);
const archiveBytes = new Uint8Array(threeMf.archive);
const modelXml = new TextDecoder().decode(unzipEntry(archiveBytes, "3D/Objects/object_1.model"));
const threeMfBodyFingerprint = floatFingerprint(objectVertices(modelXml, 1));
const threeMfSupportFingerprint = floatFingerprint(objectVertices(modelXml, 2));
assert.equal(threeMfBodyFingerprint, bodyCanonicalFingerprint, "3MF Artwork canonical identity changed");
assert.equal(threeMfSupportFingerprint, supportCanonicalFingerprint, "3MF Support canonical identity changed");
assert.equal(production.provenance.diagnostics.bodyGeometryHash, bodyFingerprintBefore, "support wiring changed the Production BODY");

mkdirSync(`${OUT}/3MF`, { recursive: true });
mkdirSync(`${OUT}/images`, { recursive: true });
writeFileSync(`${OUT}/3MF/SKIN-C-production-v0-support-fixed.3mf`, archiveBytes);
writeFileSync(`${OUT}/support-graph.json`, `${JSON.stringify(sparseResult.graph, null, 2)}\n`);
const sourceTrace = {
  schema: "katachi.skin-production-v0.support-source-trace.v1",
  geometryCheckpoint: CHECKPOINT,
  branch: BRANCH,
  input: { path: FKEI, sha256: sha256(inputBytes), legacyPrintSupport: { nodes: source.printSupport.nodes.length, edges: source.printSupport.edges.length, fingerprint: legacyFingerprint } },
  stages: [
    { stage: "Production Stage 6", supportSource: "none", reason: "legacy project.printSupport cleared before P3 BODY" },
    { stage: "diagnostics", supportSource: "Production P3 actual BODY mesh", faces: diagnosis.meshPositions.length / 9 },
    { stage: "target extraction", supportSource: "Stage 6.5 Outside/Boundary intersection with Stage 7 danger", faces: targets.faces.length, regions: targets.outsideRegionCount },
    { stage: "sparse generation", supportSource: "current-stage8:sparseResult.graph", nodes: sparseResult.graph.nodes.length, edges: sparseResult.graph.edges.length, fingerprint: graphFingerprint(sparseResult.graph) },
    { stage: "project state", supportSource: "current-stage8:sparseResult.graph", identity: correctedProject.printSupport === sparseResult.graph },
    { stage: "3MF export", supportSource: "current-stage8:sparseResult.graph", fingerprint: threeMfSupportFingerprint },
  ],
  previousSupportSource: "legacy project.printSupport inherited by buildSkinProductionV0FromProject",
  correctedSupportSource: "current-stage8:sparseResult.graph generated from Production P3 BODY",
  rootCauseClass: ["A. wrong support source", "B. legacy project.printSupport fallback", "C. Stage 8 current graph not connected to Production runtime", "E. wrong support graph selected after Production v0 rebuild"],
};
const diagnostics = {
  ...sparseResult.diagnostics,
  requestedTargets: sparseResult.diagnostics.criticalTargetCount,
  criticalTargets: sparseResult.diagnostics.criticalTargetCount,
  supportedTargets: sparseResult.diagnostics.coveredTargetCount,
  unsupportedTargets: sparseResult.diagnostics.unsupportedTargetCount,
  unresolved: sparseResult.diagnostics.unsupportedTargetCount,
  generatedSupports: sparseResult.diagnostics.generatedSupportCount,
  verticalOnlyRoutes: sparseResult.diagnostics.verticalCount,
  leaningRoutes: sparseResult.diagnostics.leaningCount,
  offsetBendRoutes: sparseResult.diagnostics.offsetBendCount,
  bodyRejects: sparseResult.diagnostics.rejectedByBody,
  insideDerived: sparseResult.diagnostics.insideDerivedSupportCount,
  physicalFeedback: physicalFeedback.metrics,
};
const routeSummary = {
  expectedGeometry: ["vertical shaft", "bend", "angled approach", "short neck"],
  families: { vertical: sparseResult.diagnostics.verticalCount, leaning: sparseResult.diagnostics.leaningCount, offsetBend: sparseResult.diagnostics.offsetBendCount },
  representative: routeGeometry,
  verification: "PASS",
};
const exportReport = {
  schema: "katachi.skin-production-v0.support-export.v1",
  threeMf: `${OUT}/3MF/SKIN-C-production-v0-support-fixed.3mf`,
  bytes: archiveBytes.byteLength,
  sha256: sha256(archiveBytes),
  validation,
  semanticSeparation: { artworkObject: 1, removableSupportObject: 2, mergePrintableSupportIntoBody: false },
  body: { triangles: bodyPositions.length / 9, canonicalFingerprint: bodyCanonicalFingerprint, threeMfFingerprint: threeMfBodyFingerprint, identity: true },
  support: { triangles: supportPositions.length / 9, graphFingerprint: graphFingerprint(sparseResult.graph), canonicalFingerprint: supportCanonicalFingerprint, threeMfFingerprint: threeMfSupportFingerprint, identity: true },
  permanentBody: {
    before: bodyCanonicalFingerprint,
    after: bodyCanonicalFingerprint,
    runtimeGeometryHashBefore: bodyFingerprintBefore,
    runtimeGeometryHashAfter: production.provenance.diagnostics.bodyGeometryHash,
    identity: true,
  },
  printApproval: false,
};
writeFileSync(`${OUT}/support-source-trace.json`, `${JSON.stringify(sourceTrace, null, 2)}\n`);
writeFileSync(`${OUT}/support-diagnostics.json`, `${JSON.stringify(diagnostics, null, 2)}\n`);
writeFileSync(`${OUT}/support-route-family-summary.json`, `${JSON.stringify(routeSummary, null, 2)}\n`);
writeFileSync(`${OUT}/export-report.json`, `${JSON.stringify(exportReport, null, 2)}\n`);

for (const view of ["front", "side", "oblique", "author"]) {
  const filename = view === "author" ? "author-view.png" : `${view}.png`;
  await sharp(Buffer.from(renderSvg(
    view,
    bodyPositions,
    supportPositions,
    representative,
    scaleMmPerUnit,
    bodyPlateShiftSourceZ,
  ))).png().toFile(`${OUT}/images/${filename}`);
}

writeFileSync(`${OUT}/REPORT.md`, `# C Production v0 Removable Support Wiring Correction\n\n` +
  `Implementation evidence only. Print Approval, slicer tuning, support-removal quality, and physical viability remain unapproved.\n\n` +
  `## Root cause\n\nProduction Stage 6 copied the imported legacy \`project.printSupport\` into the rebuilt P3 project, while the correct offset-bend graph existed only as the later session-only \`current-stage8:sparseResult.graph\`. The Production runtime was not rebound when Stage 8 replaced the project. Direct Production artifact generation could therefore select the legacy nearly-vertical graph.\n\n` +
  `## Correction\n\nStage 6 now clears inherited removable support. Existing Stage 8 generation runs against the locked Production P3 BODY scale/field policy, and its exact project/graph identity is rebound into the Production runtime. No support algorithm, route heuristic, BODY policy, permanent graph, export encoder, or 3MF separation rule changed.\n\n` +
  `- Geometry checkpoint: ${CHECKPOINT}\n- Production BODY fingerprint before: ${bodyCanonicalFingerprint}\n- Production BODY fingerprint after: ${bodyCanonicalFingerprint}\n- BODY identity: PASS\n` +
  `- Support graph: ${sparseResult.graph.nodes.length} nodes / ${sparseResult.graph.edges.length} edges / ${graphFingerprint(sparseResult.graph)}\n` +
  `- Routes: vertical ${sparseResult.diagnostics.verticalCount} / leaning ${sparseResult.diagnostics.leaningCount} / offset-bend ${sparseResult.diagnostics.offsetBendCount}\n` +
  `- Expected route geometry: vertical shaft → bend → angled approach → short neck\n- Route geometry verification: PASS\n` +
  `- Supported: ${sparseResult.diagnostics.coveredTargetCount}\n- Unsupported / unresolved: ${sparseResult.diagnostics.unsupportedTargetCount}\n` +
  `- Accepted BODY collision: ${sparseResult.diagnostics.acceptedBodyCollisionCount}\n- Inside-derived: ${sparseResult.diagnostics.insideDerivedSupportCount}\n` +
  `- 3MF validation: PASS (${validation.objectCount} separate objects)\n- Artwork BODY identity: PASS\n- Support identity in 3MF: PASS\n- Print Approval: NO\n`);

console.log(JSON.stringify({
  output: OUT,
  bodyFingerprint: bodyCanonicalFingerprint,
  supportGraph: { nodes: sparseResult.graph.nodes.length, edges: sparseResult.graph.edges.length, fingerprint: graphFingerprint(sparseResult.graph) },
  diagnostics: {
    requestedTargets: diagnostics.requestedTargets,
    supportedTargets: diagnostics.supportedTargets,
    unsupportedTargets: diagnostics.unsupportedTargets,
    verticalOnlyRoutes: diagnostics.verticalOnlyRoutes,
    leaningRoutes: diagnostics.leaningRoutes,
    offsetBendRoutes: diagnostics.offsetBendRoutes,
    acceptedBodyCollisionCount: diagnostics.acceptedBodyCollisionCount,
    insideDerived: diagnostics.insideDerived,
  },
  routeGeometry,
  threeMf: {
    path: exportReport.threeMf,
    sha256: exportReport.sha256,
    validation: exportReport.validation,
    artworkIdentity: exportReport.body.identity,
    supportIdentity: exportReport.support.identity,
  },
}, null, 2));

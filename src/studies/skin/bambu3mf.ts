export type BambuVolumeRole = "body" | "printable_support" | "support_enforcer" | "support_blocker";

/**
 * Tree is intentionally excluded: its router may enter porous interiors even
 * when every requested contact face is exterior-reachable.
 */
export type BambuSupportType = "normal(manual)";

export interface TriangleSoupVolume {
  name: string;
  role: BambuVolumeRole;
  /** xyz triplets, three vertices per triangle, already expressed in mm. */
  positions: Float32Array;
}

export interface IndexedTriangleMesh {
  vertices: Float32Array;
  indices: Uint32Array;
  removedDegenerateTriangles: number;
}

export interface SupportEnforcerOptions {
  /** In-plane growth around every diagnosed triangle. */
  marginMm: number;
  /** Thickness outside the BODY surface, along its outward normal. */
  outsideDepthMm: number;
  /** Overlap into BODY. Required for Bambu's volume intersection. */
  insideDepthMm: number;
}

export interface Bambu3mfOptions {
  title: string;
  supportType: BambuSupportType;
  /** Shared instance translation. A1 mini's plate center is 90, 90 mm. */
  plateCenter?: { x: number; y: number };
  date?: string;
  generatorVersion?: string;
  /** Package BODY and printable scaffold as one normal mesh part. */
  mergePrintableSupportIntoBody?: boolean;
}

export interface Bambu3mfStats {
  bodyFaces: number;
  bodyVertices: number;
  scaffoldFaces: number;
  enforcerFaces: number;
  blockerFaces: number;
  removedDegenerateTriangles: number;
  bodyRemovedDegenerateTriangles: number;
  placementTranslationMm: { x: number; y: number; z: number };
  uncompressedBytes: number;
  modelUncompressedBytes: number;
  compressedModelBytes: number;
  bodyIndexedVertexBytes: number;
  bodyIndexedIndexBytes: number;
  supportIndexedBytes: number;
  largestSerializationChunkBytes: number;
  peakJsHeapBytes: number | null;
  archiveBytes: number;
}

export interface Bambu3mfResult {
  archive: ArrayBuffer;
  stats: Bambu3mfStats;
}

export type Bambu3mfProgressStage =
  | "Indexing BODY"
  | "Indexing Support"
  | "Writing vertices"
  | "Writing triangles"
  | "Compressing model XML"
  | "Assembling ZIP";

export interface Bambu3mfProgress {
  readonly stage: Bambu3mfProgressStage;
  readonly completed?: number;
  readonly total?: number;
  readonly uncompressedBytes?: number;
  readonly compressedBytes?: number;
}

export interface Bambu3mfExecutionOptions {
  /** Execution-only serialization bound. It is not part of package identity. */
  readonly serializationChunkBytes?: number;
  readonly onProgress?: (progress: Bambu3mfProgress) => void;
}

export const DEFAULT_SUPPORT_ENFORCER_OPTIONS: SupportEnforcerOptions = {
  marginMm: 0.4,
  outsideDepthMm: 0.35,
  insideDepthMm: 0.55,
};

const textEncoder = new TextEncoder();
export const DEFAULT_3MF_SERIALIZATION_CHUNK_BYTES = 1024 * 1024;
export const ZIP32_MAX = 0xffffffff;
const IDENTITY_3MF = "1 0 0 0 1 0 0 0 1 0 0 0";
const IDENTITY_4X4 = "1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1";

function finiteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function xmlEscape(value: string): string {
  return value
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&apos;");
}

function xmlNumber(value: number): string {
  const rounded = Math.fround(finiteNumber(value));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function vertexKey(x: number, y: number, z: number): string {
  // Inputs are Float32 triangle soups. The string form is therefore an exact
  // key for equal exported coordinates, without welding nearby real detail.
  return `${Math.fround(x)},${Math.fround(y)},${Math.fround(z)}`;
}

export function indexTriangleSoup(positions: Float32Array): IndexedTriangleMesh {
  if (positions.length % 9 !== 0) throw new Error("三角形bufferの長さが9の倍数ではありません");
  const vertices: number[] = [];
  const indices: number[] = [];
  const vertexByKey = new Map<string, number>();
  let removedDegenerateTriangles = 0;
  for (let offset = 0; offset < positions.length; offset += 9) {
    const triangleIndices: number[] = [];
    for (let vertex = 0; vertex < 3; vertex++) {
      const base = offset + vertex * 3;
      const x = Math.fround(positions[base]);
      const y = Math.fround(positions[base + 1]);
      const z = Math.fround(positions[base + 2]);
      const key = vertexKey(x, y, z);
      let index = vertexByKey.get(key);
      if (index === undefined) {
        index = vertices.length / 3;
        vertexByKey.set(key, index);
        vertices.push(x, y, z);
      }
      triangleIndices.push(index);
    }
    if (
      triangleIndices[0] === triangleIndices[1] ||
      triangleIndices[1] === triangleIndices[2] ||
      triangleIndices[2] === triangleIndices[0]
    ) {
      removedDegenerateTriangles++;
      continue;
    }
    indices.push(triangleIndices[0], triangleIndices[1], triangleIndices[2]);
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
    removedDegenerateTriangles,
  };
}

export function scaleTriangleSoup(positions: Float32Array, scale: number): Float32Array {
  const result = new Float32Array(positions.length);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  for (let index = 0; index < positions.length; index++) result[index] = positions[index] * safeScale;
  return result;
}

export function triangleSoupLongestExtent(positions: Float32Array): number {
  if (positions.length < 3) return 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let offset = 0; offset + 2 < positions.length; offset += 3) {
    const x = positions[offset], y = positions[offset + 1], z = positions[offset + 2];
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  return Math.max(maxX - minX, maxY - minY, maxZ - minZ);
}

/**
 * Internal Structure already supports part of the diagnosed outer Surface.
 * Export only the danger that remains after that structure is fused; using
 * the before-buffer would ask Bambu to support the same region twice.
 */
export function supportEnforcerPositionsForDiagnosis(
  before: Float32Array,
  after: Float32Array,
  internalEdgeCount: number,
): Float32Array {
  return internalEdgeCount > 0 ? after : before;
}

export function parseBinaryStlPositions(stl: ArrayBuffer): Float32Array {
  if (stl.byteLength < 84) throw new Error("STLが短すぎます");
  const view = new DataView(stl);
  const triangleCount = view.getUint32(80, true);
  const expected = 84 + triangleCount * 50;
  if (expected > stl.byteLength) throw new Error("STLの面数とbyte長が一致しません");
  const positions = new Float32Array(triangleCount * 9);
  let target = 0;
  for (let face = 0; face < triangleCount; face++) {
    let source = 84 + face * 50 + 12;
    for (let value = 0; value < 9; value++, source += 4) positions[target++] = view.getFloat32(source, true);
  }
  return positions;
}

function appendTriangle(target: number[], a: number[], b: number[], c: number[]): void {
  target.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

/**
 * Turns final-resolution diagnosed faces into closed, thin triangular prisms.
 * Each prism straddles BODY: the inside depth provides a real intersection,
 * while the outside depth lets Bambu see a non-zero modifier region. This is
 * deliberately a dry first implementation, not a generated support pillar.
 */
export function buildSupportEnforcerTriangleSoup(
  dangerousPositionsMm: Float32Array,
  options: SupportEnforcerOptions = DEFAULT_SUPPORT_ENFORCER_OPTIONS,
): Float32Array {
  if (dangerousPositionsMm.length % 9 !== 0) throw new Error("危険面bufferの長さが9の倍数ではありません");
  const margin = Math.max(0, finiteNumber(options.marginMm));
  const outside = Math.max(0.01, finiteNumber(options.outsideDepthMm, 0.35));
  const inside = Math.max(0.01, finiteNumber(options.insideDepthMm, 0.55));
  const triangles: number[] = [];
  for (let offset = 0; offset < dangerousPositionsMm.length; offset += 9) {
    const source = [
      [dangerousPositionsMm[offset], dangerousPositionsMm[offset + 1], dangerousPositionsMm[offset + 2]],
      [dangerousPositionsMm[offset + 3], dangerousPositionsMm[offset + 4], dangerousPositionsMm[offset + 5]],
      [dangerousPositionsMm[offset + 6], dangerousPositionsMm[offset + 7], dangerousPositionsMm[offset + 8]],
    ];
    if (!source.every((point) => point.every(Number.isFinite))) continue;
    const ab = source[1].map((value, axis) => value - source[0][axis]);
    const ac = source[2].map((value, axis) => value - source[0][axis]);
    const nx = ab[1] * ac[2] - ab[2] * ac[1];
    const ny = ab[2] * ac[0] - ab[0] * ac[2];
    const nz = ab[0] * ac[1] - ab[1] * ac[0];
    const length = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(length) || length === 0) continue;
    const normal = [nx / length, ny / length, nz / length];
    const centroid = [0, 1, 2].map((axis) => (source[0][axis] + source[1][axis] + source[2][axis]) / 3);
    const expanded = source.map((point) => {
      const radial = point.map((value, axis) => value - centroid[axis]);
      const radialLength = Math.hypot(radial[0], radial[1], radial[2]);
      return point.map((value, axis) => value + (radialLength > 1e-9 ? radial[axis] / radialLength * margin : 0));
    });
    const outer = expanded.map((point) => point.map((value, axis) => value + normal[axis] * outside));
    const inner = expanded.map((point) => point.map((value, axis) => value - normal[axis] * inside));
    appendTriangle(triangles, outer[0], outer[1], outer[2]);
    appendTriangle(triangles, inner[0], inner[2], inner[1]);
    for (let edge = 0; edge < 3; edge++) {
      const next = (edge + 1) % 3;
      appendTriangle(triangles, outer[edge], inner[edge], inner[next]);
      appendTriangle(triangles, outer[edge], inner[next], outer[next]);
    }
  }
  return new Float32Array(triangles);
}

function* meshXmlParts(
  id: number,
  role: BambuVolumeRole,
  mesh: IndexedTriangleMesh,
  onProgress?: (progress: Bambu3mfProgress) => void,
): Generator<string> {
  const type = role === "body" || role === "printable_support" ? "model" : "other";
  const uuid = `0001000${id - 1}-b206-40ff-9872-83e8017abed1`;
  yield `  <object id="${id}" p:UUID="${uuid}" type="${type}">\n   <mesh>\n    <vertices>\n`;
  const vertexTotal = mesh.vertices.length / 3;
  for (let offset = 0; offset < mesh.vertices.length; offset += 3) {
    yield `     <vertex x="${xmlNumber(mesh.vertices[offset])}" y="${xmlNumber(mesh.vertices[offset + 1])}" z="${xmlNumber(mesh.vertices[offset + 2])}"/>\n`;
    const completed = offset / 3 + 1;
    if (onProgress && (completed % 65536 === 0 || completed === vertexTotal)) {
      onProgress({ stage: "Writing vertices", completed, total: vertexTotal });
    }
  }
  yield "    </vertices>\n    <triangles>\n";
  const triangleTotal = mesh.indices.length / 3;
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    yield `     <triangle v1="${mesh.indices[offset]}" v2="${mesh.indices[offset + 1]}" v3="${mesh.indices[offset + 2]}"/>\n`;
    const completed = offset / 3 + 1;
    if (onProgress && (completed % 65536 === 0 || completed === triangleTotal)) {
      onProgress({ stage: "Writing triangles", completed, total: triangleTotal });
    }
  }
  yield "    </triangles>\n   </mesh>\n  </object>\n";
}

function meshXml(id: number, role: BambuVolumeRole, mesh: IndexedTriangleMesh): string {
  return Array.from(meshXmlParts(id, role, mesh)).join("");
}

function subtype(role: BambuVolumeRole): string {
  if (role === "support_enforcer") return "support_enforcer";
  if (role === "support_blocker") return "support_blocker";
  return "normal_part";
}

function boundsOf(vertices: Float32Array): { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let offset = 0; offset < vertices.length; offset += 3) {
    const x = vertices[offset], y = vertices[offset + 1], z = vertices[offset + 2];
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function prepareBambu3mfPackageEntries(
  volumes: TriangleSoupVolume[],
  options: Bambu3mfOptions,
  includeLargeModel: boolean,
  execution: Bambu3mfExecutionOptions = {},
): {
  entries: Array<{ name: string; data: Uint8Array }>;
  indexed: Array<{ volume: TriangleSoupVolume; mesh: IndexedTriangleMesh }>;
  stats: Omit<Bambu3mfStats, "archiveBytes">;
} {
  if (options.supportType !== "normal(manual)") {
    throw new Error("Tree supportはporous interiorへの経路を制限できないため書き出せません。normal(manual)を使用してください");
  }
  const bodyIndex = volumes.findIndex((volume) => volume.role === "body");
  if (bodyIndex < 0) throw new Error("BODY volumeがありません");
  if (volumes[bodyIndex].positions.length === 0) throw new Error("BODY meshが空です");
  const ordered = [volumes[bodyIndex], ...volumes.filter((_, index) => index !== bodyIndex && _.positions.length > 0)];
  const sourceIndexed = ordered.map((volume) => {
    const stage: Bambu3mfProgressStage = volume.role === "body" ? "Indexing BODY" : "Indexing Support";
    execution.onProgress?.({ stage, completed: 0, total: volume.positions.length / 9 });
    const mesh = indexTriangleSoup(volume.positions);
    execution.onProgress?.({ stage, completed: volume.positions.length / 9, total: volume.positions.length / 9 });
    return { volume, mesh };
  });
  let indexed: Array<{ volume: TriangleSoupVolume; mesh: IndexedTriangleMesh }> = sourceIndexed;
  if (options.mergePrintableSupportIntoBody && sourceIndexed.some((item) => item.volume.role === "printable_support")) {
    const mergedSources = sourceIndexed.filter((item) => item.volume.role === "body" || item.volume.role === "printable_support");
    const mergedLength = mergedSources.reduce((sum, item) => sum + item.volume.positions.length, 0);
    const mergedPositions = new Float32Array(mergedLength);
    let mergedOffset = 0;
    for (const item of mergedSources) {
      mergedPositions.set(item.volume.positions, mergedOffset);
      mergedOffset += item.volume.positions.length;
    }
    const mergedVolume: TriangleSoupVolume = { name: "BODY_WITH_SCAFFOLD", role: "body", positions: mergedPositions };
    indexed = [
      { volume: mergedVolume, mesh: indexTriangleSoup(mergedPositions) },
      ...sourceIndexed.filter((item) => item.volume.role !== "body" && item.volume.role !== "printable_support"),
    ];
  }
  const objectId = indexed.length + 1;
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const title = xmlEscape(options.title);
  const generatorVersion = xmlEscape(options.generatorVersion ?? "0.62.0");
  const bodyBounds = boundsOf(indexed[0].mesh.vertices);
  // All parts share one authored coordinate system. Z placement therefore
  // uses the union, not BODY alone; otherwise a support root fractionally
  // below BODY can make the slicer move or repair the parts independently.
  const allBounds = indexed.map((item) => boundsOf(item.mesh.vertices));
  const plateCenter = options.plateCenter ?? { x: 90, y: 90 };
  const tx = plateCenter.x - (bodyBounds.minX + bodyBounds.maxX) / 2;
  const ty = plateCenter.y - (bodyBounds.minY + bodyBounds.maxY) / 2;
  const tz = -Math.min(...allBounds.map((bounds) => bounds.minZ));
  const instanceTransform = `1 0 0 0 1 0 0 0 1 ${xmlNumber(tx)} ${xmlNumber(ty)} ${xmlNumber(tz)}`;
  const hasEnforcer = sourceIndexed.some((item) => item.volume.role === "support_enforcer");
  const hasScaffold = sourceIndexed.some((item) => item.volume.role === "printable_support");
  const description = hasScaffold
    ? (options.mergePrintableSupportIntoBody
      ? "Katachi SKIN fused BODY and printable support"
      : "Katachi SKIN artwork and printable support as separate parts")
    : hasEnforcer
      ? "Katachi SKIN BODY with Bambu support enforcer; no printable support part"
      : "Katachi SKIN BODY-only; no printable support";

  const subModelHeader = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n',
    ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n',
  ];
  const subModelFooter = " </resources>\n <build/>\n</model>\n";
  const subModel = includeLargeModel
    ? [...subModelHeader, ...indexed.map(({ volume, mesh }, index) => meshXml(index + 1, volume.role, mesh)), subModelFooter].join("")
    : null;

  const components = indexed.map((_, index) =>
    `    <component p:path="/3D/Objects/object_1.model" objectid="${index + 1}" p:UUID="0001000${index}-b206-40ff-9872-83e8017abed1" transform="${IDENTITY_3MF}"/>\n`,
  ).join("");
  const rootModel = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n',
    // Bambu currently refuses model_settings.config without a recognized
    // Application semver. Katachi is named separately so authorship remains
    // explicit while the compatibility target stays pinned and testable.
    ' <metadata name="Application">BambuStudio-02.06.00.51</metadata>\n',
    ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n',
    ` <metadata name="Katachi:Generator">Katachi SKIN ${generatorVersion}</metadata>\n`,
    ` <metadata name="Title">${title}</metadata>\n`,
    ` <metadata name="Description">${description}</metadata>\n`,
    ` <metadata name="CreationDate">${date}</metadata>\n <metadata name="ModificationDate">${date}</metadata>\n`,
    ` <resources>\n  <object id="${objectId}" p:UUID="00000001-61cb-4c03-9d28-80fed5dfa1dc" type="model">\n   <components>\n`,
    components,
    "   </components>\n  </object>\n </resources>\n",
    ' <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">\n',
    `  <item objectid="${objectId}" p:UUID="00000001-b1ec-4553-aec9-835e5b724bb4" transform="${instanceTransform}" printable="1"/>\n`,
    " </build>\n</model>\n",
  ].join("");

  const totalFaces = indexed.reduce((sum, item) => sum + item.mesh.indices.length / 3, 0);
  const parts = indexed.map(({ volume, mesh }, index) => [
    `    <part id="${index + 1}" subtype="${subtype(volume.role)}">\n`,
    `      <metadata key="name" value="${xmlEscape(volume.name)}"/>\n`,
    `      <metadata key="matrix" value="${IDENTITY_4X4}"/>\n`,
    `      <mesh_stat face_count="${mesh.indices.length / 3}" edges_fixed="0" degenerate_facets="${mesh.removedDegenerateTriangles}" facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n`,
    "    </part>\n",
  ].join("")).join("");
  const supportMetadata = hasEnforcer
    ? `    <metadata key="enable_support" value="1"/>\n    <metadata key="support_type" value="${options.supportType}"/>\n    <metadata key="support_style" value="snug"/>\n    <metadata key="support_on_build_plate_only" value="1"/>\n    <metadata key="support_expansion" value="0"/>\n`
    : hasScaffold
      ? `    <metadata key="enable_support" value="0"/>\n`
      : "";
  const modelSettings = [
    '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n',
    `  <object id="${objectId}">\n    <metadata key="name" value="${title}"/>\n`,
    supportMetadata,
    `    <metadata face_count="${totalFaces}"/>\n`, parts, "  </object>\n",
    "  <plate>\n    <metadata key=\"plater_id\" value=\"1\"/>\n    <metadata key=\"plater_name\" value=\"Katachi SKIN\"/>\n    <metadata key=\"locked\" value=\"false\"/>\n",
    `    <model_instance>\n      <metadata key="object_id" value="${objectId}"/>\n      <metadata key="instance_id" value="0"/>\n      <metadata key="identify_id" value="1"/>\n    </model_instance>\n`,
    "  </plate>\n</config>\n",
  ].join("");

  const contentTypes = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>\n';
  const rootRelationships = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n';
  const modelRelationships = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n';
  const rawEntries = [
    { name: "[Content_Types].xml", text: contentTypes },
    { name: "_rels/.rels", text: rootRelationships },
    { name: "3D/3dmodel.model", text: rootModel },
    { name: "3D/_rels/3dmodel.model.rels", text: modelRelationships },
    ...(subModel === null ? [] : [{ name: "3D/Objects/object_1.model", text: subModel }]),
    { name: "Metadata/model_settings.config", text: modelSettings },
  ];
  const entries = rawEntries.map((entry) => ({ name: entry.name, data: textEncoder.encode(entry.text) }));
  const uncompressedBytes = entries.reduce((sum, entry) => sum + entry.data.byteLength, 0);
  const modelUncompressedBytes = entries.find((entry) => entry.name === "3D/Objects/object_1.model")?.data.byteLength ?? 0;
  const bodyIndexed = sourceIndexed.find((item) => item.volume.role === "body")!;
  const supportIndexedBytes = sourceIndexed
    .filter((item) => item.volume.role === "printable_support")
    .reduce((sum, item) => sum + item.mesh.vertices.byteLength + item.mesh.indices.byteLength, 0);
  return {
    entries,
    indexed,
    stats: {
      bodyFaces: sourceIndexed.filter((item) => item.volume.role === "body").reduce((sum, item) => sum + item.mesh.indices.length / 3, 0),
      bodyVertices: indexed.filter((item) => item.volume.role === "body").reduce((sum, item) => sum + item.mesh.vertices.length / 3, 0),
      scaffoldFaces: sourceIndexed.filter((item) => item.volume.role === "printable_support").reduce((sum, item) => sum + item.mesh.indices.length / 3, 0),
      enforcerFaces: sourceIndexed.filter((item) => item.volume.role === "support_enforcer").reduce((sum, item) => sum + item.mesh.indices.length / 3, 0),
      blockerFaces: sourceIndexed.filter((item) => item.volume.role === "support_blocker").reduce((sum, item) => sum + item.mesh.indices.length / 3, 0),
      removedDegenerateTriangles: indexed.reduce((sum, item) => sum + item.mesh.removedDegenerateTriangles, 0),
      bodyRemovedDegenerateTriangles: sourceIndexed.find((item) => item.volume.role === "body")?.mesh.removedDegenerateTriangles ?? 0,
      placementTranslationMm: { x: Math.fround(tx), y: Math.fround(ty), z: Math.fround(tz) },
      uncompressedBytes,
      modelUncompressedBytes,
      compressedModelBytes: 0,
      bodyIndexedVertexBytes: bodyIndexed.mesh.vertices.byteLength,
      bodyIndexedIndexBytes: bodyIndexed.mesh.indices.byteLength,
      supportIndexedBytes,
      largestSerializationChunkBytes: modelUncompressedBytes,
      peakJsHeapBytes: null,
    },
  };
}

export function buildBambu3mfPackageEntries(
  volumes: TriangleSoupVolume[],
  options: Bambu3mfOptions,
): { entries: Array<{ name: string; data: Uint8Array }>; stats: Omit<Bambu3mfStats, "archiveBytes"> } {
  const prepared = prepareBambu3mfPackageEntries(volumes, options, true);
  return { entries: prepared.entries, stats: prepared.stats };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function updateCrc32(state: number, bytes: Uint8Array): number {
  let crc = state;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc >>> 0;
}

export function crc32Chunks(chunks: Iterable<Uint8Array>): number {
  let state = 0xffffffff;
  for (const chunk of chunks) state = updateCrc32(state, chunk);
  return (state ^ 0xffffffff) >>> 0;
}

export function assertClassicZip32Value(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP32_MAX) {
    throw new Error(`${label} exceeds classic ZIP32 limit; ZIP64 is required`);
  }
}

function writeUint16(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint16(offset, value, true);
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value >>> 0, true);
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const stream = new Blob([copy.buffer]).stream()
      .pipeThrough(new CompressionStream("deflate-raw" as never));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

type IndexedModelPart = { volume: TriangleSoupVolume; mesh: IndexedTriangleMesh };

function* objectModelXmlParts(
  indexed: readonly IndexedModelPart[],
  onProgress?: (progress: Bambu3mfProgress) => void,
): Generator<string> {
  yield '<?xml version="1.0" encoding="UTF-8"?>\n';
  yield '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n';
  yield ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n';
  for (let index = 0; index < indexed.length; index++) {
    const { volume, mesh } = indexed[index];
    yield* meshXmlParts(index + 1, volume.role, mesh, onProgress);
  }
  yield " </resources>\n <build/>\n</model>\n";
}

/** Bounded UTF-8 encoding used by the large object entry and its parity tests. */
export function* boundedUtf8Chunks(parts: Iterable<string>, requestedChunkBytes = DEFAULT_3MF_SERIALIZATION_CHUNK_BYTES): Generator<Uint8Array> {
  const chunkBytes = Math.max(64, Math.min(8 * 1024 * 1024, Math.floor(requestedChunkBytes)));
  let buffer = "";
  for (const part of parts) {
    // object_1.model is deliberately ASCII-only, so UTF-16 code-unit and UTF-8
    // byte boundaries are identical and can be split without changing bytes.
    for (let offset = 0; offset < part.length;) {
      const available = chunkBytes - buffer.length;
      const take = Math.min(available, part.length - offset);
      buffer += part.slice(offset, offset + take);
      offset += take;
      if (buffer.length === chunkBytes) {
        yield textEncoder.encode(buffer);
        buffer = "";
      }
    }
  }
  if (buffer.length > 0) yield textEncoder.encode(buffer);
}

class BoundedByteCollector {
  readonly chunks: Uint8Array[] = [];
  private buffer: Uint8Array;
  private used = 0;
  totalBytes = 0;

  constructor(private readonly chunkBytes: number) {
    this.buffer = new Uint8Array(chunkBytes);
  }

  append(source: Uint8Array): void {
    let offset = 0;
    while (offset < source.byteLength) {
      const take = Math.min(this.buffer.byteLength - this.used, source.byteLength - offset);
      this.buffer.set(source.subarray(offset, offset + take), this.used);
      this.used += take;
      offset += take;
      this.totalBytes += take;
      assertClassicZip32Value(this.totalBytes, "compressed entry size");
      if (this.used === this.buffer.byteLength) this.flush(false);
    }
  }

  finish(): readonly Uint8Array[] {
    this.flush(true);
    return this.chunks;
  }

  private flush(trim: boolean): void {
    if (this.used === 0) return;
    this.chunks.push(trim && this.used < this.buffer.byteLength ? this.buffer.slice(0, this.used) : this.buffer);
    this.buffer = new Uint8Array(this.chunkBytes);
    this.used = 0;
  }
}

type EncodedZipEntry = {
  name: string;
  nameBytes: Uint8Array;
  method: number;
  payloadChunks: readonly Uint8Array[];
  compressedSize: number;
  uncompressedSize: number;
  crc: number;
};

async function compressModelXml(
  indexed: readonly IndexedModelPart[],
  execution: Bambu3mfExecutionOptions,
  sampleHeap: () => void,
): Promise<{ entry: EncodedZipEntry; largestSerializationChunkBytes: number }> {
  if (typeof CompressionStream === "undefined") throw new Error("Streaming deflate is unavailable; refusing unbounded 3MF fallback");
  const requested = execution.serializationChunkBytes ?? DEFAULT_3MF_SERIALIZATION_CHUNK_BYTES;
  const serializationChunkBytes = Math.max(64, Math.min(8 * 1024 * 1024, Math.floor(requested)));
  const compressor = new CompressionStream("deflate-raw" as never);
  const collector = new BoundedByteCollector(serializationChunkBytes);
  const reader = compressor.readable.getReader();
  const reading = (async () => {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      collector.append(result.value);
      sampleHeap();
      execution.onProgress?.({ stage: "Compressing model XML", compressedBytes: collector.totalBytes });
    }
  })();
  const writer = compressor.writable.getWriter();
  let crcState = 0xffffffff;
  let uncompressedSize = 0;
  let largestSerializationChunkBytes = 0;
  for (const chunk of boundedUtf8Chunks(objectModelXmlParts(indexed, execution.onProgress), serializationChunkBytes)) {
    largestSerializationChunkBytes = Math.max(largestSerializationChunkBytes, chunk.byteLength);
    uncompressedSize += chunk.byteLength;
    assertClassicZip32Value(uncompressedSize, "uncompressed model entry size");
    crcState = updateCrc32(crcState, chunk);
    await writer.write(chunk as Uint8Array<ArrayBuffer>);
    sampleHeap();
    execution.onProgress?.({
      stage: "Compressing model XML",
      uncompressedBytes: uncompressedSize,
      compressedBytes: collector.totalBytes,
    });
  }
  await writer.close();
  await reading;
  const payloadChunks = collector.finish();
  return {
    entry: {
      name: "3D/Objects/object_1.model",
      nameBytes: textEncoder.encode("3D/Objects/object_1.model"),
      method: 8,
      payloadChunks,
      compressedSize: collector.totalBytes,
      uncompressedSize,
      crc: (crcState ^ 0xffffffff) >>> 0,
    },
    largestSerializationChunkBytes,
  };
}

async function encodeSmallZipEntry(entry: { name: string; data: Uint8Array }): Promise<EncodedZipEntry> {
  assertClassicZip32Value(entry.data.byteLength, `${entry.name} uncompressed size`);
  const compressed = await deflateRaw(entry.data);
  const payload = compressed ?? entry.data;
  assertClassicZip32Value(payload.byteLength, `${entry.name} compressed size`);
  return {
    name: entry.name,
    nameBytes: textEncoder.encode(entry.name),
    method: compressed ? 8 : 0,
    payloadChunks: [payload],
    compressedSize: payload.byteLength,
    uncompressedSize: entry.data.byteLength,
    crc: crc32(entry.data),
  };
}

function assembleZip(entries: readonly EncodedZipEntry[]): ArrayBuffer {
  if (entries.length >= 0xffff) throw new Error("ZIP entry count exceeds classic ZIP32 limit; ZIP64 is required");
  let localBytes = 0;
  for (const entry of entries) {
    assertClassicZip32Value(localBytes, `${entry.name} local header offset`);
    localBytes += 30 + entry.nameBytes.length + entry.compressedSize;
    assertClassicZip32Value(localBytes, "ZIP local area size");
  }
  let centralBytes = 0;
  for (const entry of entries) centralBytes += 46 + entry.nameBytes.length;
  assertClassicZip32Value(centralBytes, "ZIP central directory size");
  assertClassicZip32Value(localBytes + centralBytes + 22, "ZIP archive size");
  const output = new Uint8Array(localBytes + centralBytes + 22);
  let cursor = 0;
  const central: Array<{ entry: EncodedZipEntry; offset: number }> = [];
  for (const entry of entries) {
    const offset = cursor;
    writeUint32(output, cursor, 0x04034b50); writeUint16(output, cursor + 4, 20);
    writeUint16(output, cursor + 6, 0x0800); writeUint16(output, cursor + 8, entry.method);
    writeUint16(output, cursor + 10, 0); writeUint16(output, cursor + 12, 0);
    writeUint32(output, cursor + 14, entry.crc); writeUint32(output, cursor + 18, entry.compressedSize);
    writeUint32(output, cursor + 22, entry.uncompressedSize); writeUint16(output, cursor + 26, entry.nameBytes.length);
    writeUint16(output, cursor + 28, 0); cursor += 30;
    output.set(entry.nameBytes, cursor); cursor += entry.nameBytes.length;
    for (const chunk of entry.payloadChunks) { output.set(chunk, cursor); cursor += chunk.byteLength; }
    central.push({ entry, offset });
  }
  const centralOffset = cursor;
  for (const item of central) {
    const entry = item.entry;
    writeUint32(output, cursor, 0x02014b50); writeUint16(output, cursor + 4, 20); writeUint16(output, cursor + 6, 20);
    writeUint16(output, cursor + 8, 0x0800); writeUint16(output, cursor + 10, entry.method);
    writeUint16(output, cursor + 12, 0); writeUint16(output, cursor + 14, 0);
    writeUint32(output, cursor + 16, entry.crc); writeUint32(output, cursor + 20, entry.compressedSize);
    writeUint32(output, cursor + 24, entry.uncompressedSize); writeUint16(output, cursor + 28, entry.nameBytes.length);
    writeUint16(output, cursor + 30, 0); writeUint16(output, cursor + 32, 0); writeUint16(output, cursor + 34, 0);
    writeUint16(output, cursor + 36, 0); writeUint32(output, cursor + 38, 0); writeUint32(output, cursor + 42, item.offset);
    cursor += 46; output.set(entry.nameBytes, cursor); cursor += entry.nameBytes.length;
  }
  writeUint32(output, cursor, 0x06054b50); writeUint16(output, cursor + 4, 0); writeUint16(output, cursor + 6, 0);
  writeUint16(output, cursor + 8, entries.length); writeUint16(output, cursor + 10, entries.length);
  writeUint32(output, cursor + 12, cursor - centralOffset); writeUint32(output, cursor + 16, centralOffset);
  writeUint16(output, cursor + 20, 0);
  return output.buffer;
}

/** Synthetic-gate hook: exercises the exact production XML chunking,
 * streaming compression, CRC, ZIP32 guards, and ZIP assembly without a
 * triangle-soup allocation or package metadata duplication. */
export async function buildIndexedObjectModelStreamingFixture(
  parts: readonly { role: BambuVolumeRole; mesh: IndexedTriangleMesh }[],
  execution: Bambu3mfExecutionOptions = {},
): Promise<{
  archive: ArrayBuffer;
  xmlBytes: number;
  compressedBytes: number;
  largestSerializationChunkBytes: number;
  crc: number;
}> {
  const indexed: IndexedModelPart[] = parts.map((part, index) => ({
    volume: { name: `FIXTURE_${index + 1}`, role: part.role, positions: new Float32Array(0) },
    mesh: part.mesh,
  }));
  const model = await compressModelXml(indexed, execution, () => undefined);
  const archive = assembleZip([model.entry]);
  return {
    archive,
    xmlBytes: model.entry.uncompressedSize,
    compressedBytes: model.entry.compressedSize,
    largestSerializationChunkBytes: model.largestSerializationChunkBytes,
    crc: model.entry.crc,
  };
}

function readHeapBytes(): number | null {
  const memory = (typeof performance === "undefined" ? undefined : (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory);
  return Number.isFinite(memory?.usedJSHeapSize) ? memory!.usedJSHeapSize! : null;
}

export async function buildBambu3mf(
  volumes: TriangleSoupVolume[],
  options: Bambu3mfOptions,
  execution: Bambu3mfExecutionOptions = {},
): Promise<Bambu3mfResult> {
  let peakJsHeapBytes = readHeapBytes();
  const sampleHeap = (): void => {
    const value = readHeapBytes();
    if (value !== null) peakJsHeapBytes = peakJsHeapBytes === null ? value : Math.max(peakJsHeapBytes, value);
  };
  const prepared = prepareBambu3mfPackageEntries(volumes, options, false, execution);
  sampleHeap();
  const model = await compressModelXml(prepared.indexed, execution, sampleHeap);
  const smallByName = new Map(prepared.entries.map((entry) => [entry.name, entry]));
  const orderedNames = [
    "[Content_Types].xml",
    "_rels/.rels",
    "3D/3dmodel.model",
    "3D/_rels/3dmodel.model.rels",
    "3D/Objects/object_1.model",
    "Metadata/model_settings.config",
  ];
  const encoded: EncodedZipEntry[] = [];
  for (const name of orderedNames) {
    if (name === model.entry.name) encoded.push(model.entry);
    else {
      const entry = smallByName.get(name);
      if (!entry) throw new Error(`Missing 3MF package entry ${name}`);
      encoded.push(await encodeSmallZipEntry(entry));
    }
  }
  execution.onProgress?.({
    stage: "Assembling ZIP",
    uncompressedBytes: model.entry.uncompressedSize,
    compressedBytes: model.entry.compressedSize,
  });
  const archive = assembleZip(encoded);
  sampleHeap();
  const uncompressedBytes = encoded.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  return {
    archive,
    stats: {
      ...prepared.stats,
      uncompressedBytes,
      modelUncompressedBytes: model.entry.uncompressedSize,
      compressedModelBytes: model.entry.compressedSize,
      largestSerializationChunkBytes: model.largestSerializationChunkBytes,
      peakJsHeapBytes,
      archiveBytes: archive.byteLength,
    },
  };
}

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
  scaffoldFaces: number;
  enforcerFaces: number;
  blockerFaces: number;
  removedDegenerateTriangles: number;
  uncompressedBytes: number;
  archiveBytes: number;
}

export interface Bambu3mfResult {
  archive: ArrayBuffer;
  stats: Bambu3mfStats;
}

export const DEFAULT_SUPPORT_ENFORCER_OPTIONS: SupportEnforcerOptions = {
  marginMm: 0.4,
  outsideDepthMm: 0.35,
  insideDepthMm: 0.55,
};

const textEncoder = new TextEncoder();
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

function meshXml(id: number, role: BambuVolumeRole, mesh: IndexedTriangleMesh): string {
  const type = role === "body" || role === "printable_support" ? "model" : "other";
  const uuid = `0001000${id - 1}-b206-40ff-9872-83e8017abed1`;
  const output: string[] = [`  <object id="${id}" p:UUID="${uuid}" type="${type}">\n   <mesh>\n    <vertices>\n`];
  for (let offset = 0; offset < mesh.vertices.length; offset += 3) {
    output.push(`     <vertex x="${xmlNumber(mesh.vertices[offset])}" y="${xmlNumber(mesh.vertices[offset + 1])}" z="${xmlNumber(mesh.vertices[offset + 2])}"/>\n`);
  }
  output.push("    </vertices>\n    <triangles>\n");
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    output.push(`     <triangle v1="${mesh.indices[offset]}" v2="${mesh.indices[offset + 1]}" v3="${mesh.indices[offset + 2]}"/>\n`);
  }
  output.push("    </triangles>\n   </mesh>\n  </object>\n");
  return output.join("");
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

export function buildBambu3mfPackageEntries(
  volumes: TriangleSoupVolume[],
  options: Bambu3mfOptions,
): { entries: Array<{ name: string; data: Uint8Array }>; stats: Omit<Bambu3mfStats, "archiveBytes"> } {
  if (options.supportType !== "normal(manual)") {
    throw new Error("Tree supportはporous interiorへの経路を制限できないため書き出せません。normal(manual)を使用してください");
  }
  const bodyIndex = volumes.findIndex((volume) => volume.role === "body");
  if (bodyIndex < 0) throw new Error("BODY volumeがありません");
  if (volumes[bodyIndex].positions.length === 0) throw new Error("BODY meshが空です");
  const ordered = [volumes[bodyIndex], ...volumes.filter((_, index) => index !== bodyIndex && _.positions.length > 0)];
  const sourceIndexed = ordered.map((volume) => ({ volume, mesh: indexTriangleSoup(volume.positions) }));
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
  const plateCenter = options.plateCenter ?? { x: 90, y: 90 };
  const tx = plateCenter.x - (bodyBounds.minX + bodyBounds.maxX) / 2;
  const ty = plateCenter.y - (bodyBounds.minY + bodyBounds.maxY) / 2;
  const tz = -bodyBounds.minZ;
  const instanceTransform = `1 0 0 0 1 0 0 0 1 ${xmlNumber(tx)} ${xmlNumber(ty)} ${xmlNumber(tz)}`;

  const subModel: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n',
    ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n',
  ];
  indexed.forEach(({ volume, mesh }, index) => subModel.push(meshXml(index + 1, volume.role, mesh)));
  subModel.push(" </resources>\n <build/>\n</model>\n");

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
    ` <metadata name="Description">Katachi SKIN BODY with fused deterministic all-reachable scaffold</metadata>\n`,
    ` <metadata name="CreationDate">${date}</metadata>\n <metadata name="ModificationDate">${date}</metadata>\n`,
    ` <resources>\n  <object id="${objectId}" p:UUID="00000001-61cb-4c03-9d28-80fed5dfa1dc" type="model">\n   <components>\n`,
    components,
    "   </components>\n  </object>\n </resources>\n",
    ' <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">\n',
    `  <item objectid="${objectId}" p:UUID="00000001-b1ec-4553-aec9-835e5b724bb4" transform="${instanceTransform}" printable="1"/>\n`,
    " </build>\n</model>\n",
  ].join("");

  const totalFaces = indexed.reduce((sum, item) => sum + item.mesh.indices.length / 3, 0);
  const hasEnforcer = sourceIndexed.some((item) => item.volume.role === "support_enforcer");
  const hasScaffold = sourceIndexed.some((item) => item.volume.role === "printable_support");
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
    { name: "3D/Objects/object_1.model", text: subModel.join("") },
    { name: "Metadata/model_settings.config", text: modelSettings },
  ];
  const entries = rawEntries.map((entry) => ({ name: entry.name, data: textEncoder.encode(entry.text) }));
  const uncompressedBytes = entries.reduce((sum, entry) => sum + entry.data.byteLength, 0);
  return {
    entries,
    stats: {
      bodyFaces: sourceIndexed.filter((item) => item.volume.role === "body").reduce((sum, item) => sum + item.mesh.indices.length / 3, 0),
      scaffoldFaces: sourceIndexed.filter((item) => item.volume.role === "printable_support").reduce((sum, item) => sum + item.mesh.indices.length / 3, 0),
      enforcerFaces: sourceIndexed.filter((item) => item.volume.role === "support_enforcer").reduce((sum, item) => sum + item.mesh.indices.length / 3, 0),
      blockerFaces: sourceIndexed.filter((item) => item.volume.role === "support_blocker").reduce((sum, item) => sum + item.mesh.indices.length / 3, 0),
      removedDegenerateTriangles: indexed.reduce((sum, item) => sum + item.mesh.removedDegenerateTriangles, 0),
      uncompressedBytes,
    },
  };
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

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
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

async function createZip(entries: Array<{ name: string; data: Uint8Array }>): Promise<ArrayBuffer> {
  const encoded = await Promise.all(entries.map(async (entry) => {
    const compressed = await deflateRaw(entry.data);
    return {
      ...entry,
      nameBytes: textEncoder.encode(entry.name),
      method: compressed ? 8 : 0,
      payload: compressed ?? entry.data,
      crc: crc32(entry.data),
    };
  }));
  let localBytes = 0;
  for (const entry of encoded) localBytes += 30 + entry.nameBytes.length + entry.payload.length;
  let centralBytes = 0;
  for (const entry of encoded) centralBytes += 46 + entry.nameBytes.length;
  const output = new Uint8Array(localBytes + centralBytes + 22);
  let cursor = 0;
  const central: Array<{ entry: typeof encoded[number]; offset: number }> = [];
  for (const entry of encoded) {
    const offset = cursor;
    writeUint32(output, cursor, 0x04034b50); writeUint16(output, cursor + 4, 20);
    writeUint16(output, cursor + 6, 0x0800); writeUint16(output, cursor + 8, entry.method);
    writeUint16(output, cursor + 10, 0); writeUint16(output, cursor + 12, 0);
    writeUint32(output, cursor + 14, entry.crc); writeUint32(output, cursor + 18, entry.payload.length);
    writeUint32(output, cursor + 22, entry.data.length); writeUint16(output, cursor + 26, entry.nameBytes.length);
    writeUint16(output, cursor + 28, 0); cursor += 30;
    output.set(entry.nameBytes, cursor); cursor += entry.nameBytes.length;
    output.set(entry.payload, cursor); cursor += entry.payload.length;
    central.push({ entry, offset });
  }
  const centralOffset = cursor;
  for (const item of central) {
    const entry = item.entry;
    writeUint32(output, cursor, 0x02014b50); writeUint16(output, cursor + 4, 20); writeUint16(output, cursor + 6, 20);
    writeUint16(output, cursor + 8, 0x0800); writeUint16(output, cursor + 10, entry.method);
    writeUint16(output, cursor + 12, 0); writeUint16(output, cursor + 14, 0);
    writeUint32(output, cursor + 16, entry.crc); writeUint32(output, cursor + 20, entry.payload.length);
    writeUint32(output, cursor + 24, entry.data.length); writeUint16(output, cursor + 28, entry.nameBytes.length);
    writeUint16(output, cursor + 30, 0); writeUint16(output, cursor + 32, 0); writeUint16(output, cursor + 34, 0);
    writeUint16(output, cursor + 36, 0); writeUint32(output, cursor + 38, 0); writeUint32(output, cursor + 42, item.offset);
    cursor += 46; output.set(entry.nameBytes, cursor); cursor += entry.nameBytes.length;
  }
  writeUint32(output, cursor, 0x06054b50); writeUint16(output, cursor + 4, 0); writeUint16(output, cursor + 6, 0);
  writeUint16(output, cursor + 8, encoded.length); writeUint16(output, cursor + 10, encoded.length);
  writeUint32(output, cursor + 12, cursor - centralOffset); writeUint32(output, cursor + 16, centralOffset);
  writeUint16(output, cursor + 20, 0);
  return output.buffer;
}

export async function buildBambu3mf(volumes: TriangleSoupVolume[], options: Bambu3mfOptions): Promise<Bambu3mfResult> {
  const prepared = buildBambu3mfPackageEntries(volumes, options);
  const archive = await createZip(prepared.entries);
  return { archive, stats: { ...prepared.stats, archiveBytes: archive.byteLength } };
}

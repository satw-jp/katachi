export interface Skin3mfVector3 {
  x: number;
  y: number;
  z: number;
}

export interface Skin3mfBounds extends Skin3mfVector3 {}

export type Skin3mfExpectedBounds =
  | Skin3mfBounds
  | { min: Skin3mfVector3; max: Skin3mfVector3 }
  | { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };

export interface Skin3mfValidationExpected {
  expectedBounds?: Skin3mfExpectedBounds;
  expectedTriangleCount?: number;
  expectedSupportPresent?: boolean;
  expectedUnit?: string;
  tolerance?: number;
}

export interface Skin3mfValidationReport {
  valid: boolean;
  unit: string;
  objectCount: number;
  componentCount: number;
  buildItemCount: number;
  vertexCount: number;
  triangleCount: number;
  bounds: Skin3mfBounds;
  boundsMin: Skin3mfVector3;
  boundsMax: Skin3mfVector3;
  supportPresent: boolean;
  errors: string[];
  warnings: string[];
}

interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
}

interface ZipArchive {
  entries: Map<string, Uint8Array>;
}

interface MeshObject {
  path: string;
  id: number;
  type: string;
  element: XmlElement;
}

interface ParsedModel {
  path: string;
  unit: string;
  objects: Map<number, MeshObject>;
}

const DEFAULT_TOLERANCE_MM = 1e-4;
const MODEL_RELATIONSHIP_TYPE = "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel";

function emptyVector(): Skin3mfVector3 {
  return { x: 0, y: 0, z: 0 };
}

function makeReport(): Skin3mfValidationReport {
  return {
    valid: false,
    unit: "",
    objectCount: 0,
    componentCount: 0,
    buildItemCount: 0,
    vertexCount: 0,
    triangleCount: 0,
    bounds: emptyVector(),
    boundsMin: emptyVector(),
    boundsMax: emptyVector(),
    supportPresent: false,
    errors: [],
    warnings: [],
  };
}

function asBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error("ZIP record is truncated");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error("ZIP record is truncated");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function textFromBytes(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`invalid UTF-8 in ${label}`);
  }
}

function decodeXmlEntity(value: string): string {
  let output = "";
  let cursor = 0;
  while (cursor < value.length) {
    const ampersand = value.indexOf("&", cursor);
    if (ampersand < 0) return output + value.slice(cursor);
    output += value.slice(cursor, ampersand);
    const semicolon = value.indexOf(";", ampersand + 1);
    if (semicolon < 0) throw new Error("unterminated XML character reference");
    const body = value.slice(ampersand + 1, semicolon);
    if (body === "quot") output += '"';
    else if (body === "apos") output += "'";
    else if (body === "lt") output += "<";
    else if (body === "gt") output += ">";
    else if (body === "amp") output += "&";
    else {
      const radix = body.startsWith("#x") ? 16 : body.startsWith("#") ? 10 : 0;
      const digits = radix === 16 ? body.slice(2) : radix === 10 ? body.slice(1) : "";
      if (radix === 0 || !digits || !/^[0-9a-f]+$/i.test(digits) || (radix === 10 && !/^\d+$/.test(digits))) {
        throw new Error("invalid XML character reference");
      }
      const codePoint = Number.parseInt(digits, radix);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        throw new Error("invalid XML character reference");
      }
      output += String.fromCodePoint(codePoint);
    }
    cursor = semicolon + 1;
  }
  return output;
}

function isXmlNameStart(value: string): boolean {
  return /[A-Za-z_:]/.test(value);
}

function isXmlNamePart(value: string): boolean {
  return /[A-Za-z0-9_.:-]/.test(value);
}

function parseXml(input: string): XmlElement {
  let cursor = 0;
  let root: XmlElement | null = null;
  const stack: XmlElement[] = [];

  const append = (element: XmlElement): void => {
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(element);
    else if (root) throw new Error("XML has multiple root elements");
    else root = element;
  };

  while (cursor < input.length) {
    if (input[cursor] !== "<") {
      const next = input.indexOf("<", cursor);
      const end = next < 0 ? input.length : next;
      const text = input.slice(cursor, end);
      decodeXmlEntity(text);
      if (stack.length === 0 && text.trim() !== "") throw new Error("XML has text outside the root element");
      cursor = end;
      continue;
    }

    if (input.startsWith("<!--", cursor)) {
      const end = input.indexOf("-->", cursor + 4);
      if (end < 0) throw new Error("XML comment is unterminated");
      cursor = end + 3;
      continue;
    }
    if (input.startsWith("<![CDATA[", cursor)) {
      const end = input.indexOf("]]>", cursor + 9);
      if (end < 0) throw new Error("XML CDATA is unterminated");
      if (stack.length === 0 && input.slice(cursor + 9, end).trim() !== "") throw new Error("XML has text outside the root element");
      cursor = end + 3;
      continue;
    }
    if (input.startsWith("<?", cursor)) {
      const end = input.indexOf("?>", cursor + 2);
      if (end < 0) throw new Error("XML processing instruction is unterminated");
      cursor = end + 2;
      continue;
    }
    if (input.startsWith("<!", cursor)) throw new Error("unsupported XML declaration");

    let tagEnd = cursor + 1;
    let quote = "";
    while (tagEnd < input.length) {
      const character = input[tagEnd];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
      tagEnd++;
    }
    if (tagEnd >= input.length || quote) throw new Error("XML start/end tag is unterminated");

    const rawTag = input.slice(cursor + 1, tagEnd);
    if (rawTag.startsWith("/")) {
      const name = rawTag.slice(1).trim();
      if (!name || /\s/.test(name)) throw new Error("invalid XML end tag");
      const open = stack.pop();
      if (!open || open.name !== name) throw new Error(`XML end tag does not match ${name}`);
      cursor = tagEnd + 1;
      continue;
    }

    let body = rawTag.trim();
    const selfClosing = body.endsWith("/");
    if (selfClosing) body = body.slice(0, -1).trimEnd();
    let offset = 0;
    while (offset < body.length && /\s/.test(body[offset])) offset++;
    if (offset >= body.length || !isXmlNameStart(body[offset])) throw new Error("invalid XML start tag name");
    const nameStart = offset++;
    while (offset < body.length && isXmlNamePart(body[offset])) offset++;
    const name = body.slice(nameStart, offset);
    const attributes: Record<string, string> = {};
    while (offset < body.length) {
      while (offset < body.length && /\s/.test(body[offset])) offset++;
      if (offset >= body.length) break;
      if (!isXmlNameStart(body[offset])) throw new Error(`invalid XML attribute in ${name}`);
      const attributeStart = offset++;
      while (offset < body.length && isXmlNamePart(body[offset])) offset++;
      const attributeName = body.slice(attributeStart, offset);
      if (attributes[attributeName] !== undefined) throw new Error(`duplicate XML attribute ${attributeName}`);
      while (offset < body.length && /\s/.test(body[offset])) offset++;
      if (body[offset] !== "=") throw new Error(`XML attribute ${attributeName} has no value`);
      offset++;
      while (offset < body.length && /\s/.test(body[offset])) offset++;
      const delimiter = body[offset];
      if (delimiter !== '"' && delimiter !== "'") throw new Error(`XML attribute ${attributeName} is not quoted`);
      offset++;
      const valueStart = offset;
      while (offset < body.length && body[offset] !== delimiter) offset++;
      if (offset >= body.length) throw new Error(`XML attribute ${attributeName} is unterminated`);
      const value = body.slice(valueStart, offset);
      if (value.includes("<")) throw new Error(`XML attribute ${attributeName} contains '<'`);
      attributes[attributeName] = decodeXmlEntity(value);
      offset++;
    }

    const element: XmlElement = { name, attributes, children: [] };
    append(element);
    if (!selfClosing) stack.push(element);
    cursor = tagEnd + 1;
  }

  if (stack.length > 0) throw new Error(`XML element ${stack[stack.length - 1].name} is unclosed`);
  if (!root) throw new Error("XML has no root element");
  return root;
}

function localName(name: string): string {
  const separator = name.indexOf(":");
  return separator < 0 ? name : name.slice(separator + 1);
}

function child(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((candidate) => localName(candidate.name) === name);
}

function children(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((candidate) => localName(candidate.name) === name);
}

function attribute(element: XmlElement, name: string): string | undefined {
  return element.attributes[name];
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseFiniteNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeZipPath(value: string, base = "/"): string {
  const raw = value.replace(/\\/g, "/");
  const combined = raw.startsWith("/") ? raw : `${base.replace(/\/$/, "")}/${raw}`;
  const parts: string[] = [];
  for (const part of combined.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `/${parts.join("/")}`;
}

function relationshipFileFor(modelPath: string): string {
  const normalized = normalizeZipPath(modelPath);
  const slash = normalized.lastIndexOf("/");
  const directory = normalized.slice(0, slash);
  const file = normalized.slice(slash + 1);
  return `${directory}/_rels/${file}.rels`;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    let value = (crc ^ byte) & 0xff;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    crc = (crc >>> 8) ^ value;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = 22;
  const start = Math.max(0, bytes.length - (minimum + 0xffff));
  for (let offset = bytes.length - minimum; offset >= start; offset--) {
    if (readUint32(bytes, offset) === 0x06054b50) return offset;
  }
  throw new Error("ZIP end-of-central-directory record is missing");
}

async function inflateRaw(payload: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(payload.byteLength);
  copy.set(payload);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw" as never));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZip(value: ArrayBuffer | Uint8Array): Promise<ZipArchive> {
  const bytes = asBytes(value);
  const eocd = findEndOfCentralDirectory(bytes);
  const disk = readUint16(bytes, eocd + 4);
  const centralDisk = readUint16(bytes, eocd + 6);
  const entriesOnDisk = readUint16(bytes, eocd + 8);
  const entryCount = readUint16(bytes, eocd + 10);
  const centralSize = readUint32(bytes, eocd + 12);
  const centralOffset = readUint32(bytes, eocd + 16);
  const commentLength = readUint16(bytes, eocd + 20);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) throw new Error("multi-disk ZIP archives are unsupported");
  if (entryCount === 0) throw new Error("ZIP archive has no entries");
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error("ZIP64 archives are unsupported");
  if (eocd + 22 + commentLength > bytes.length) throw new Error("ZIP comment is truncated");
  if (centralOffset + centralSize > eocd) throw new Error("ZIP central directory is outside the archive");

  const entries = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (readUint32(bytes, cursor) !== 0x02014b50) throw new Error("ZIP central directory entry is invalid");
    const flags = readUint16(bytes, cursor + 8);
    const method = readUint16(bytes, cursor + 10);
    const expectedCrc = readUint32(bytes, cursor + 16);
    const compressedSize = readUint32(bytes, cursor + 20);
    const uncompressedSize = readUint32(bytes, cursor + 24);
    const nameLength = readUint16(bytes, cursor + 28);
    const extraLength = readUint16(bytes, cursor + 30);
    const commentSize = readUint16(bytes, cursor + 32);
    const localOffset = readUint32(bytes, cursor + 42);
    if ((flags & 0x0001) !== 0) throw new Error("encrypted ZIP entries are unsupported");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error("ZIP64 entry is unsupported");
    const nameStart = cursor + 46;
    const name = textFromBytes(bytes.slice(nameStart, nameStart + nameLength), "ZIP entry name");
    if (!name || entries.has(name)) throw new Error(`duplicate or empty ZIP entry: ${name}`);
    const centralNext = nameStart + nameLength + extraLength + commentSize;
    if (centralNext > centralOffset + centralSize) throw new Error("ZIP central directory entry is truncated");
    if (readUint32(bytes, localOffset) !== 0x04034b50) throw new Error(`ZIP local header is missing for ${name}`);
    const localNameLength = readUint16(bytes, localOffset + 26);
    const localExtraLength = readUint16(bytes, localOffset + 28);
    const localNameStart = localOffset + 30;
    const localName = textFromBytes(bytes.slice(localNameStart, localNameStart + localNameLength), "ZIP local entry name");
    if (localName !== name) throw new Error(`ZIP local and central names differ for ${name}`);
    const localFlags = readUint16(bytes, localOffset + 6);
    const localMethod = readUint16(bytes, localOffset + 8);
    if ((localFlags & 0x0001) !== 0 || localMethod !== method) throw new Error(`ZIP local header disagrees with central directory for ${name}`);
    if ((localFlags & 0x0008) === 0) {
      if (readUint32(bytes, localOffset + 14) !== expectedCrc
        || readUint32(bytes, localOffset + 18) !== compressedSize
        || readUint32(bytes, localOffset + 22) !== uncompressedSize) {
        throw new Error(`ZIP local sizes or CRC disagree with central directory for ${name}`);
      }
    }
    const payloadStart = localNameStart + localNameLength + localExtraLength;
    const payloadEnd = payloadStart + compressedSize;
    if (payloadEnd > bytes.length || payloadEnd > centralOffset) throw new Error(`ZIP payload is truncated for ${name}`);
    const payload = bytes.slice(payloadStart, payloadEnd);
    let data: Uint8Array;
    if (method === 0) data = payload;
    else if (method === 8) data = await inflateRaw(payload);
    else throw new Error(`unsupported ZIP compression method ${method} for ${name}`);
    if (data.byteLength !== uncompressedSize) throw new Error(`ZIP size mismatch for ${name}`);
    if (crc32(data) !== expectedCrc) throw new Error(`ZIP CRC mismatch for ${name}`);
    entries.set(name, data);
    cursor = centralNext;
  }
  if (cursor !== centralOffset + centralSize) throw new Error("ZIP central directory size does not match its entries");
  return { entries };
}

function parseXmlEntry(archive: ZipArchive, name: string, errors: string[]): XmlElement | null {
  const data = archive.entries.get(name);
  if (!data) {
    errors.push(`missing required entry: ${name}`);
    return null;
  }
  try {
    return parseXml(textFromBytes(data, name));
  } catch (error) {
    errors.push(`malformed XML in ${name}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function relationshipTargets(
  element: XmlElement | null,
  base: string,
  errors: string[],
  label: string,
  expectedType?: string,
): Set<string> {
  const targets = new Set<string>();
  if (!element) return targets;
  if (localName(element.name) !== "Relationships") {
    errors.push(`${label} has an invalid root element`);
    return targets;
  }
  for (const relationship of children(element, "Relationship")) {
    const target = attribute(relationship, "Target");
    if (!target) {
      errors.push(`${label} contains a relationship without Target`);
      continue;
    }
    if (attribute(relationship, "TargetMode") === "External") {
      errors.push(`${label} contains an external relationship: ${target}`);
      continue;
    }
    if (expectedType && attribute(relationship, "Type") !== expectedType) {
      errors.push(`${label} contains a relationship with an unexpected Type`);
      continue;
    }
    targets.add(normalizeZipPath(target, base));
  }
  return targets;
}

function parseModel(path: string, data: Uint8Array, errors: string[]): ParsedModel | null {
  let root: XmlElement;
  try {
    root = parseXml(textFromBytes(data, path));
  } catch (error) {
    errors.push(`malformed XML in ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  if (localName(root.name) !== "model") {
    errors.push(`${path} does not have a model root element`);
    return null;
  }
  const unit = attribute(root, "unit") ?? "";
  const resources = child(root, "resources");
  if (!resources) {
    errors.push(`${path} is missing resources`);
    return { path, unit, objects: new Map() };
  }
  const objects = new Map<number, MeshObject>();
  for (const object of children(resources, "object")) {
    const id = parsePositiveInteger(attribute(object, "id"));
    if (id === null) {
      errors.push(`${path} contains an object with an invalid id`);
      continue;
    }
    if (objects.has(id)) {
      errors.push(`${path} contains duplicate object id ${id}`);
      continue;
    }
    objects.set(id, { path, id, type: attribute(object, "type") ?? "", element: object });
  }
  return { path, unit, objects };
}

function updateBounds(report: Skin3mfValidationReport, point: Skin3mfVector3, hasPoint: boolean): boolean {
  if (!hasPoint) {
    report.boundsMin = { ...point };
    report.boundsMax = { ...point };
    return true;
  }
  report.boundsMin.x = Math.min(report.boundsMin.x, point.x);
  report.boundsMin.y = Math.min(report.boundsMin.y, point.y);
  report.boundsMin.z = Math.min(report.boundsMin.z, point.z);
  report.boundsMax.x = Math.max(report.boundsMax.x, point.x);
  report.boundsMax.y = Math.max(report.boundsMax.y, point.y);
  report.boundsMax.z = Math.max(report.boundsMax.z, point.z);
  return true;
}

function inspectMeshObject(object: MeshObject, report: Skin3mfValidationReport): boolean {
  const mesh = child(object.element, "mesh");
  if (!mesh) {
    report.errors.push(`object ${object.path}#${object.id} is missing mesh geometry`);
    return false;
  }
  const verticesElement = child(mesh, "vertices");
  const trianglesElement = child(mesh, "triangles");
  if (!verticesElement) report.errors.push(`object ${object.path}#${object.id} is missing vertices`);
  if (!trianglesElement) report.errors.push(`object ${object.path}#${object.id} is missing triangles`);
  const vertexElements = verticesElement ? children(verticesElement, "vertex") : [];
  const triangleElements = trianglesElement ? children(trianglesElement, "triangle") : [];
  if (vertexElements.length === 0) report.errors.push(`object ${object.path}#${object.id} has no vertices`);
  if (triangleElements.length === 0) report.errors.push(`object ${object.path}#${object.id} has no triangles`);

  const objectVertices: Skin3mfVector3[] = [];
  let hasBounds = report.vertexCount > 0;
  for (const vertex of vertexElements) {
    const point = {
      x: parseFiniteNumber(attribute(vertex, "x")),
      y: parseFiniteNumber(attribute(vertex, "y")),
      z: parseFiniteNumber(attribute(vertex, "z")),
    };
    if (point.x === null || point.y === null || point.z === null) {
      report.errors.push(`non-finite vertex coordinate in ${object.path}#${object.id}`);
      continue;
    }
    const finitePoint = { x: point.x, y: point.y, z: point.z };
    objectVertices.push(finitePoint);
    report.vertexCount++;
    hasBounds = updateBounds(report, finitePoint, hasBounds);
  }

  for (const triangle of triangleElements) {
    report.triangleCount++;
    const indices = [
      parsePositiveInteger(attribute(triangle, "v1")),
      parsePositiveInteger(attribute(triangle, "v2")),
      parsePositiveInteger(attribute(triangle, "v3")),
    ];
    if (indices.some((index) => index === null || index >= objectVertices.length)) {
      report.errors.push(`triangle index out of range in ${object.path}#${object.id}`);
      continue;
    }
    if (indices[0] === indices[1] || indices[1] === indices[2] || indices[2] === indices[0]) {
      report.warnings.push(`degenerate triangle in ${object.path}#${object.id}`);
    }
  }
  return true;
}

function expectedBoundsMismatch(
  actual: Skin3mfValidationReport,
  expected: Skin3mfExpectedBounds,
  tolerance: number,
): string[] {
  const errors: string[] = [];
  const close = (actualValue: number, expectedValue: number, label: string): void => {
    if (!Number.isFinite(expectedValue) || Math.abs(actualValue - expectedValue) > tolerance) {
      errors.push(`bounds ${label} mismatch: actual ${actualValue}, expected ${expectedValue}, tolerance ${tolerance}`);
    }
  };
  if ("min" in expected && "max" in expected) {
    close(actual.boundsMin.x, expected.min.x, "min.x");
    close(actual.boundsMin.y, expected.min.y, "min.y");
    close(actual.boundsMin.z, expected.min.z, "min.z");
    close(actual.boundsMax.x, expected.max.x, "max.x");
    close(actual.boundsMax.y, expected.max.y, "max.y");
    close(actual.boundsMax.z, expected.max.z, "max.z");
  } else if ("minX" in expected) {
    close(actual.boundsMin.x, expected.minX, "min.x");
    close(actual.boundsMin.y, expected.minY, "min.y");
    close(actual.boundsMin.z, expected.minZ, "min.z");
    close(actual.boundsMax.x, expected.maxX, "max.x");
    close(actual.boundsMax.y, expected.maxY, "max.y");
    close(actual.boundsMax.z, expected.maxZ, "max.z");
  } else {
    close(actual.bounds.x, expected.x, "x");
    close(actual.bounds.y, expected.y, "y");
    close(actual.bounds.z, expected.z, "z");
  }
  return errors;
}

function inspectSettings(
  archive: ZipArchive,
  models: ParsedModel[],
  report: Skin3mfValidationReport,
): void {
  const settingsData = archive.entries.get("Metadata/model_settings.config");
  if (!settingsData) {
    report.errors.push("missing required entry: Metadata/model_settings.config");
    return;
  }
  let settings: XmlElement;
  try {
    settings = parseXml(textFromBytes(settingsData, "Metadata/model_settings.config"));
  } catch (error) {
    report.errors.push(`malformed XML in Metadata/model_settings.config: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (localName(settings.name) !== "config") report.errors.push("Metadata/model_settings.config does not have a config root element");
  const knownObjectIds = new Set(models.flatMap((model) => [...model.objects.keys()]));
  let hasSupportMetadata = false;
  for (const metadata of children(settings, "metadata")) {
    if (attribute(metadata, "key") === "enable_support" && attribute(metadata, "value") === "1") hasSupportMetadata = true;
  }
  for (const object of children(settings, "object")) {
    for (const part of children(object, "part")) {
      const id = parsePositiveInteger(attribute(part, "id"));
      if (id === null) {
        report.errors.push("model settings contains a part with an invalid id");
        continue;
      }
      if (!knownObjectIds.has(id)) report.errors.push(`model settings part references missing object ${id}`);
      const subtype = attribute(part, "subtype") ?? "";
      const name = child(part, "metadata") && attribute(child(part, "metadata") as XmlElement, "key") === "name"
        ? attribute(child(part, "metadata") as XmlElement, "value") ?? ""
        : "";
      if (/support|scaffold/i.test(subtype) || /support|scaffold/i.test(name)) report.supportPresent = true;
    }
  }
  report.supportPresent = report.supportPresent || hasSupportMetadata || models.some((model) => [...model.objects.values()].some((object) => object.type === "other"));
}

/**
 * Validate the existing SKIN 3MF package format without changing production
 * export semantics. Bounds are measured in submodel mesh coordinates, before
 * the root build-item plate translation is applied.
 */
export async function validateSkin3mf(
  bytes: ArrayBuffer | Uint8Array,
  expected: Skin3mfValidationExpected = {},
): Promise<Skin3mfValidationReport> {
  const report = makeReport();
  let archive: ZipArchive;
  try {
    archive = await readZip(bytes);
  } catch (error) {
    report.errors.push(`invalid 3MF ZIP container: ${error instanceof Error ? error.message : String(error)}`);
    return report;
  }

  const requiredEntries = ["[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model"];
  for (const name of requiredEntries) if (!archive.entries.has(name)) report.errors.push(`missing required entry: ${name}`);

  const contentTypes = parseXmlEntry(archive, "[Content_Types].xml", report.errors);
  if (contentTypes && localName(contentTypes.name) !== "Types") report.errors.push("[Content_Types].xml does not have a Types root element");
  const rootRelationships = parseXmlEntry(archive, "_rels/.rels", report.errors);
  const rootRelationshipTargets = relationshipTargets(rootRelationships, "/", report.errors, "_rels/.rels", MODEL_RELATIONSHIP_TYPE);
  if (!rootRelationshipTargets.has("/3D/3dmodel.model")) report.errors.push("root relationships do not reference /3D/3dmodel.model");

  const rootData = archive.entries.get("3D/3dmodel.model");
  if (!rootData) return report;
  const rootModel = parseModel("/3D/3dmodel.model", rootData, report.errors);
  if (!rootModel) return report;
  report.unit = rootModel.unit;
  const expectedUnit = expected.expectedUnit ?? "millimeter";
  if (!rootModel.unit) report.errors.push("3D/3dmodel.model is missing unit");
  else if (rootModel.unit !== expectedUnit) report.errors.push(`unsupported unit: ${rootModel.unit} (expected ${expectedUnit})`);

  const modelRelationshipPath = relationshipFileFor("/3D/3dmodel.model").slice(1);
  const modelRelationships = parseXmlEntry(archive, modelRelationshipPath, report.errors);
  const modelRelationshipTargets = relationshipTargets(modelRelationships, "/3D", report.errors, "3D/3dmodel.model relationships", MODEL_RELATIONSHIP_TYPE);

  const rootResources = child(parseXml(textFromBytes(rootData, "3D/3dmodel.model")), "resources");
  const rootBuild = child(parseXml(textFromBytes(rootData, "3D/3dmodel.model")), "build");
  if (!rootResources) report.errors.push("3D/3dmodel.model is missing resources");
  if (!rootBuild) report.errors.push("3D/3dmodel.model is missing build");
  const rootObjects = rootResources ? children(rootResources, "object") : [];
  const rootObjectIds = new Set<number>();
  const componentReferences: Array<{ path: string; objectId: number }> = [];
  for (const object of rootObjects) {
    const id = parsePositiveInteger(attribute(object, "id"));
    if (id !== null) rootObjectIds.add(id);
    const components = child(object, "components");
    if (!components) {
      report.errors.push(`root object ${attribute(object, "id") ?? "?"} is missing components`);
      continue;
    }
    for (const component of children(components, "component")) {
      const pathAttribute = attribute(component, "p:path") ?? attribute(component, "path");
      const objectId = parsePositiveInteger(attribute(component, "objectid"));
      if (!pathAttribute || objectId === null) {
        report.errors.push("component has a missing or invalid object reference");
        continue;
      }
      const path = normalizeZipPath(pathAttribute);
      componentReferences.push({ path, objectId });
      if (!modelRelationshipTargets.has(path)) report.errors.push(`model relationships do not reference ${path}`);
    }
  }
  report.componentCount = componentReferences.length;
  if (report.componentCount === 0) report.errors.push("3D/3dmodel.model has no component references");

  const buildItems = rootBuild ? children(rootBuild, "item") : [];
  report.buildItemCount = buildItems.length;
  if (report.buildItemCount === 0) report.errors.push("3D/3dmodel.model has no build items");
  for (const item of buildItems) {
    const objectId = parsePositiveInteger(attribute(item, "objectid"));
    if (objectId === null || !rootObjectIds.has(objectId)) report.errors.push(`build item references missing root object ${attribute(item, "objectid") ?? "?"}`);
  }

  const modelsByPath = new Map<string, ParsedModel>();
  for (const reference of componentReferences) {
    if (modelsByPath.has(reference.path)) continue;
    const entryName = reference.path.slice(1);
    const data = archive.entries.get(entryName);
    if (!data) {
      report.errors.push(`component references missing model XML: ${entryName}`);
      continue;
    }
    const model = parseModel(reference.path, data, report.errors);
    if (model) {
      modelsByPath.set(reference.path, model);
      if (!model.unit) report.errors.push(`${reference.path} is missing unit`);
      else if (model.unit !== rootModel.unit) report.errors.push(`unit mismatch between root model and ${reference.path}`);
    }
  }
  const referencedObjects = new Set<string>();
  for (const reference of componentReferences) {
    const model = modelsByPath.get(reference.path);
    const object = model?.objects.get(reference.objectId);
    if (!object) {
      report.errors.push(`missing object reference: ${reference.path}#${reference.objectId}`);
      continue;
    }
    referencedObjects.add(`${reference.path}#${reference.objectId}`);
  }
  for (const model of modelsByPath.values()) {
    for (const object of model.objects.values()) {
      report.objectCount++;
      inspectMeshObject(object, report);
    }
  }
  if (report.objectCount === 0) report.errors.push("3MF contains no mesh objects");
  if (report.vertexCount === 0) report.errors.push("3MF contains no vertices");
  if (report.triangleCount === 0) report.errors.push("3MF contains no triangles");
  if (report.vertexCount > 0) {
    report.bounds = {
      x: report.boundsMax.x - report.boundsMin.x,
      y: report.boundsMax.y - report.boundsMin.y,
      z: report.boundsMax.z - report.boundsMin.z,
    };
  }
  if (referencedObjects.size !== report.objectCount) report.warnings.push("3MF contains an unreferenced mesh object");

  inspectSettings(archive, [...modelsByPath.values()], report);
  const tolerance = expected.tolerance !== undefined && Number.isFinite(expected.tolerance) && expected.tolerance >= 0
    ? expected.tolerance
    : DEFAULT_TOLERANCE_MM;
  if (expected.expectedTriangleCount !== undefined && report.triangleCount !== expected.expectedTriangleCount) {
    report.errors.push(`triangle count mismatch: actual ${report.triangleCount}, expected ${expected.expectedTriangleCount}`);
  }
  if (expected.expectedBounds) report.errors.push(...expectedBoundsMismatch(report, expected.expectedBounds, tolerance));
  if (expected.expectedSupportPresent !== undefined && report.supportPresent !== expected.expectedSupportPresent) {
    report.errors.push(`support presence mismatch: actual ${report.supportPresent}, expected ${expected.expectedSupportPresent}`);
  }
  report.valid = report.errors.length === 0;
  return report;
}

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
  bytes: Uint8Array;
  entries: Map<string, ZipEntryDescriptor>;
  validated: Set<string>;
}

interface ZipEntryDescriptor {
  name: string;
  method: number;
  expectedCrc: number;
  compressedSize: number;
  uncompressedSize: number;
  payloadStart: number;
}

interface MeshObject {
  path: string;
  id: number;
  type: string;
  element?: XmlElement;
  inspection?: MeshInspection;
}

interface MeshInspection {
  hasMesh: boolean;
  hasVertices: boolean;
  hasTriangles: boolean;
  vertexCount: number;
  triangleCount: number;
  boundsMin: Skin3mfVector3;
  boundsMax: Skin3mfVector3;
  errors: string[];
  warnings: string[];
}

interface ParsedModel {
  path: string;
  unit: string;
  objects: Map<number, MeshObject>;
  parseErrors?: string[];
}

const DEFAULT_TOLERANCE_MM = 1e-4;
const DEFAULT_STREAMING_THRESHOLD_BYTES = 8 * 1024 * 1024;
const DEFAULT_STREAM_CHUNK_BYTES = 1024 * 1024;
const MODEL_RELATIONSHIP_TYPE = "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel";

export interface Skin3mfValidationProgress {
  stage: "Reading model XML" | "Validating model XML";
  entry: string;
  completed: number;
  total: number;
}

export interface Skin3mfValidationTelemetry {
  mode: "legacy" | "streaming";
  entry: string;
  compressedBytes: number;
  uncompressedBytes: number;
  largestCompressedInputChunkBytes: number;
  largestInflatedChunkBytes: number;
  largestDecodedTextChunkCharacters: number;
  largestParserBufferCharacters: number;
}

export interface Skin3mfValidationExecutionOptions {
  modelMode?: "auto" | "legacy" | "streaming";
  streamingThresholdBytes?: number;
  compressedInputChunkBytes?: number;
  onProgress?: (progress: Skin3mfValidationProgress) => void;
  onTelemetry?: (telemetry: Skin3mfValidationTelemetry) => void;
}

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

function crc32Update(crc: number, bytes: Uint8Array): number {
  let next = crc;
  for (const byte of bytes) {
    let value = (next ^ byte) & 0xff;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    next = (next >>> 8) ^ value;
  }
  return next;
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

  const entries = new Map<string, ZipEntryDescriptor>();
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
    if (method !== 0 && method !== 8) throw new Error(`unsupported ZIP compression method ${method} for ${name}`);
    entries.set(name, { name, method, expectedCrc, compressedSize, uncompressedSize, payloadStart });
    cursor = centralNext;
  }
  if (cursor !== centralOffset + centralSize) throw new Error("ZIP central directory size does not match its entries");
  return { bytes, entries, validated: new Set() };
}

async function materializeEntry(archive: ZipArchive, name: string): Promise<Uint8Array> {
  const entry = archive.entries.get(name);
  if (!entry) throw new Error(`missing required entry: ${name}`);
  const payload = archive.bytes.subarray(entry.payloadStart, entry.payloadStart + entry.compressedSize);
  const data = entry.method === 0 ? payload : await inflateRaw(payload);
  if (data.byteLength !== entry.uncompressedSize) throw new Error(`ZIP size mismatch for ${name}`);
  if (crc32(data) !== entry.expectedCrc) throw new Error(`ZIP CRC mismatch for ${name}`);
  archive.validated.add(name);
  return data;
}

async function parseXmlEntry(archive: ZipArchive, name: string, errors: string[]): Promise<XmlElement | null> {
  if (!archive.entries.has(name)) {
    errors.push(`missing required entry: ${name}`);
    return null;
  }
  try {
    const data = await materializeEntry(archive, name);
    return parseXml(textFromBytes(data, name));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`${message.startsWith("ZIP ") ? "invalid 3MF ZIP container" : `malformed XML in ${name}`}: ${message}`);
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

interface XmlEventHandler {
  start(name: string, attributes: Record<string, string>, ancestors: readonly string[]): void;
  end(name: string, ancestors: readonly string[]): void;
}

class IncrementalXmlParser {
  private buffer = "";
  private rootName: string | null = null;
  private readonly stack: string[] = [];
  largestBufferCharacters = 0;

  constructor(private readonly handler: XmlEventHandler) {}

  write(text: string, final = false): void {
    this.buffer += text;
    this.largestBufferCharacters = Math.max(this.largestBufferCharacters, this.buffer.length);
    let cursor = 0;
    while (cursor < this.buffer.length) {
      if (this.buffer[cursor] !== "<") {
        const next = this.buffer.indexOf("<", cursor);
        if (next < 0 && !final) {
          const tail = this.buffer.slice(cursor);
          const ampersand = tail.lastIndexOf("&");
          const safeEnd = ampersand >= 0 && tail.indexOf(";", ampersand) < 0 ? cursor + ampersand : this.buffer.length;
          const safeText = this.buffer.slice(cursor, safeEnd);
          if (safeText) this.validateText(safeText);
          this.buffer = this.buffer.slice(safeEnd);
          this.largestBufferCharacters = Math.max(this.largestBufferCharacters, this.buffer.length);
          return;
        }
        const end = next < 0 ? this.buffer.length : next;
        this.validateText(this.buffer.slice(cursor, end));
        cursor = end;
        continue;
      }
      if (this.buffer.startsWith("<!--", cursor)) {
        const end = this.buffer.indexOf("-->", cursor + 4);
        if (end < 0) {
          if (final) throw new Error("XML comment is unterminated");
          break;
        }
        cursor = end + 3;
        continue;
      }
      if (this.buffer.startsWith("<![CDATA[", cursor)) {
        const end = this.buffer.indexOf("]]>", cursor + 9);
        if (end < 0) {
          if (final) throw new Error("XML CDATA is unterminated");
          break;
        }
        if (this.stack.length === 0 && this.buffer.slice(cursor + 9, end).trim() !== "") throw new Error("XML has text outside the root element");
        cursor = end + 3;
        continue;
      }
      if (this.buffer.startsWith("<?", cursor)) {
        const end = this.buffer.indexOf("?>", cursor + 2);
        if (end < 0) {
          if (final) throw new Error("XML processing instruction is unterminated");
          break;
        }
        cursor = end + 2;
        continue;
      }
      if (!final) {
        const pending = this.buffer.slice(cursor);
        if ("<!--".startsWith(pending) || "<![CDATA[".startsWith(pending)) break;
      }
      if (this.buffer.startsWith("<!", cursor)) throw new Error("unsupported XML declaration");

      let tagEnd = cursor + 1;
      let quote = "";
      while (tagEnd < this.buffer.length) {
        const character = this.buffer[tagEnd];
        if (quote) {
          if (character === quote) quote = "";
        } else if (character === '"' || character === "'") quote = character;
        else if (character === ">") break;
        tagEnd++;
      }
      if (tagEnd >= this.buffer.length || quote) {
        if (final) throw new Error("XML start/end tag is unterminated");
        break;
      }
      const rawTag = this.buffer.slice(cursor + 1, tagEnd);
      if (rawTag.startsWith("/")) {
        const name = rawTag.slice(1).trim();
        if (!name || /\s/.test(name)) throw new Error("invalid XML end tag");
        const open = this.stack.pop();
        if (!open || open !== name) throw new Error(`XML end tag does not match ${name}`);
        this.handler.end(name, this.stack);
      } else {
        let body = rawTag.trim();
        const selfClosing = body.endsWith("/");
        if (selfClosing) body = body.slice(0, -1).trimEnd();
        const parsed = parseXmlStartTag(body);
        if (this.stack.length === 0) {
          if (this.rootName) throw new Error("XML has multiple root elements");
          this.rootName = parsed.name;
        }
        this.handler.start(parsed.name, parsed.attributes, this.stack);
        if (selfClosing) this.handler.end(parsed.name, this.stack);
        else this.stack.push(parsed.name);
      }
      cursor = tagEnd + 1;
    }
    this.buffer = this.buffer.slice(cursor);
    this.largestBufferCharacters = Math.max(this.largestBufferCharacters, this.buffer.length);
    if (final) {
      if (this.buffer) throw new Error("XML start/end tag is unterminated");
      if (this.stack.length > 0) throw new Error(`XML element ${this.stack[this.stack.length - 1]} is unclosed`);
      if (!this.rootName) throw new Error("XML has no root element");
    }
  }

  private validateText(text: string): void {
    decodeXmlEntity(text);
    if (this.stack.length === 0 && text.trim() !== "") throw new Error("XML has text outside the root element");
  }
}

function parseXmlStartTag(body: string): { name: string; attributes: Record<string, string> } {
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
  return { name, attributes };
}

function makeInspection(): MeshInspection {
  return { hasMesh: false, hasVertices: false, hasTriangles: false, vertexCount: 0, triangleCount: 0, boundsMin: emptyVector(), boundsMax: emptyVector(), errors: [], warnings: [] };
}

function createModelEventHandler(path: string): { handler: XmlEventHandler; result: () => ParsedModel | null } {
  let root = "";
  let unit = "";
  let hasResources = false;
  const objects = new Map<number, MeshObject>();
  const objectByDepth = new Map<number, MeshObject>();
  const invalidObjectDepths = new Set<number>();
  const parseErrors: string[] = [];
  const handler: XmlEventHandler = {
    start(name, attributes, ancestors) {
      const local = localName(name);
      const parent = ancestors.length ? localName(ancestors[ancestors.length - 1]) : "";
      const depth = ancestors.length;
      if (depth === 0) { root = local; unit = attributes.unit ?? ""; }
      if (depth === 1 && parent === "model" && local === "resources") hasResources = true;
      if (depth === 2 && localName(ancestors[0] ?? "") === "model" && parent === "resources" && local === "object") {
        const id = parsePositiveInteger(attributes.id);
        if (id === null) { parseErrors.push(`${path} contains an object with an invalid id`); invalidObjectDepths.add(depth); return; }
        if (objects.has(id)) { parseErrors.push(`${path} contains duplicate object id ${id}`); invalidObjectDepths.add(depth); return; }
        const object: MeshObject = { path, id, type: attributes.type ?? "", inspection: makeInspection() };
        objects.set(id, object); objectByDepth.set(depth, object);
        return;
      }
      let object: MeshObject | undefined;
      for (let candidateDepth = depth - 1; candidateDepth >= 0; candidateDepth--) {
        object = objectByDepth.get(candidateDepth);
        if (object || invalidObjectDepths.has(candidateDepth)) break;
      }
      const inspection = object?.inspection;
      if (!inspection) return;
      const state = inspection as MeshInspection & { meshDepth?: number; verticesDepth?: number; trianglesDepth?: number };
      if (local === "mesh" && parent === "object" && state.meshDepth === undefined) { state.hasMesh = true; state.meshDepth = depth; return; }
      if (state.meshDepth !== undefined && local === "vertices" && parent === "mesh" && state.verticesDepth === undefined) { state.hasVertices = true; state.verticesDepth = depth; return; }
      if (state.meshDepth !== undefined && local === "triangles" && parent === "mesh" && state.trianglesDepth === undefined) { state.hasTriangles = true; state.trianglesDepth = depth; return; }
      if (state.verticesDepth !== undefined && depth === state.verticesDepth + 1 && local === "vertex" && parent === "vertices") {
        const x = parseFiniteNumber(attributes.x), y = parseFiniteNumber(attributes.y), z = parseFiniteNumber(attributes.z);
        if (x === null || y === null || z === null) { state.errors.push(`non-finite vertex coordinate in ${path}#${object!.id}`); return; }
        const point = { x, y, z };
        if (state.vertexCount === 0) { state.boundsMin = { ...point }; state.boundsMax = { ...point }; }
        else {
          state.boundsMin.x = Math.min(state.boundsMin.x, x); state.boundsMin.y = Math.min(state.boundsMin.y, y); state.boundsMin.z = Math.min(state.boundsMin.z, z);
          state.boundsMax.x = Math.max(state.boundsMax.x, x); state.boundsMax.y = Math.max(state.boundsMax.y, y); state.boundsMax.z = Math.max(state.boundsMax.z, z);
        }
        state.vertexCount++;
      }
      if (state.trianglesDepth !== undefined && depth === state.trianglesDepth + 1 && local === "triangle" && parent === "triangles") {
        state.triangleCount++;
        const indices = [parsePositiveInteger(attributes.v1), parsePositiveInteger(attributes.v2), parsePositiveInteger(attributes.v3)];
        if (indices.some((index) => index === null || index >= state.vertexCount)) state.errors.push(`triangle index out of range in ${path}#${object!.id}`);
        else if (indices[0] === indices[1] || indices[1] === indices[2] || indices[2] === indices[0]) state.warnings.push(`degenerate triangle in ${path}#${object!.id}`);
      }
    },
    end(name, ancestors) {
      const depth = ancestors.length;
      if (localName(name) === "object") { objectByDepth.delete(depth); invalidObjectDepths.delete(depth); }
    },
  };
  return { handler, result: () => {
    if (root !== "model") return null;
    if (!hasResources) return { path, unit, objects: new Map(), parseErrors: [`${path} is missing resources`] } as ParsedModel & { parseErrors: string[] };
    return Object.assign({ path, unit, objects }, { parseErrors });
  } };
}

function compressedEntryStream(archive: ZipArchive, entry: ZipEntryDescriptor, chunkBytes: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= entry.compressedSize) { controller.close(); return; }
      const length = Math.min(chunkBytes, entry.compressedSize - offset);
      const start = entry.payloadStart + offset;
      controller.enqueue(archive.bytes.subarray(start, start + length));
      offset += length;
    },
  });
}

async function parseModelStreaming(
  archive: ZipArchive,
  entry: ZipEntryDescriptor,
  path: string,
  options: Skin3mfValidationExecutionOptions,
): Promise<ParsedModel> {
  const chunkBytes = Math.max(1, Math.floor(options.compressedInputChunkBytes ?? DEFAULT_STREAM_CHUNK_BYTES));
  const source = compressedEntryStream(archive, entry, chunkBytes);
  const inflated: ReadableStream<Uint8Array> = entry.method === 8
    ? source.pipeThrough(new DecompressionStream("deflate-raw" as never) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
    : source;
  const reader = inflated.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const model = createModelEventHandler(path);
  const parser = new IncrementalXmlParser(model.handler);
  let crc = 0xffffffff;
  let uncompressedBytes = 0;
  let largestInflatedChunkBytes = 0;
  let largestDecodedTextChunkCharacters = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value ?? new Uint8Array(0);
      crc = crc32Update(crc, chunk);
      uncompressedBytes += chunk.byteLength;
      largestInflatedChunkBytes = Math.max(largestInflatedChunkBytes, chunk.byteLength);
      let text: string;
      try { text = decoder.decode(chunk, { stream: true }); }
      catch { throw new Error(`invalid UTF-8 in ${path}`); }
      largestDecodedTextChunkCharacters = Math.max(largestDecodedTextChunkCharacters, text.length);
      parser.write(text);
      options.onProgress?.({ stage: "Validating model XML", entry: path, completed: uncompressedBytes, total: entry.uncompressedSize });
    }
    let tail: string;
    try { tail = decoder.decode(); }
    catch { throw new Error(`invalid UTF-8 in ${path}`); }
    parser.write(tail, true);
  } finally {
    reader.releaseLock();
  }
  if (uncompressedBytes !== entry.uncompressedSize) throw new Error(`ZIP size mismatch for ${entry.name}`);
  if (((crc ^ 0xffffffff) >>> 0) !== entry.expectedCrc) throw new Error(`ZIP CRC mismatch for ${entry.name}`);
  archive.validated.add(entry.name);
  const result = model.result();
  if (!result) throw new ModelRootMismatchError(`${path} does not have a model root element`);
  options.onTelemetry?.({
    mode: "streaming", entry: path, compressedBytes: entry.compressedSize, uncompressedBytes,
    largestCompressedInputChunkBytes: Math.min(chunkBytes, entry.compressedSize), largestInflatedChunkBytes,
    largestDecodedTextChunkCharacters, largestParserBufferCharacters: parser.largestBufferCharacters,
  });
  return result;
}

class ModelRootMismatchError extends Error {}

async function parseModelEntry(
  archive: ZipArchive,
  entryName: string,
  path: string,
  errors: string[],
  options: Skin3mfValidationExecutionOptions,
): Promise<ParsedModel | null> {
  const entry = archive.entries.get(entryName);
  if (!entry) return null;
  const threshold = options.streamingThresholdBytes ?? DEFAULT_STREAMING_THRESHOLD_BYTES;
  const mode = options.modelMode === "legacy" ? "legacy"
    : options.modelMode === "streaming" || entry.uncompressedSize >= threshold ? "streaming" : "legacy";
  try {
    if (mode === "streaming") {
      const model = await parseModelStreaming(archive, entry, path, options);
      if (model.parseErrors) errors.push(...model.parseErrors);
      return model;
    }
    const data = await materializeEntry(archive, entryName);
    const model = parseModel(path, data, errors);
    options.onTelemetry?.({ mode: "legacy", entry: path, compressedBytes: entry.compressedSize, uncompressedBytes: data.byteLength, largestCompressedInputChunkBytes: entry.compressedSize, largestInflatedChunkBytes: data.byteLength, largestDecodedTextChunkCharacters: data.byteLength, largestParserBufferCharacters: data.byteLength });
    return model;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ModelRootMismatchError) errors.push(message);
    else errors.push(`${message.startsWith("ZIP ") ? "invalid 3MF ZIP container" : `malformed XML in ${path}`}: ${message}`);
    return null;
  }
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
  if (object.inspection) {
    const inspection = object.inspection;
    if (!inspection.hasMesh) { report.errors.push(`object ${object.path}#${object.id} is missing mesh geometry`); return false; }
    if (!inspection.hasVertices) report.errors.push(`object ${object.path}#${object.id} is missing vertices`);
    if (!inspection.hasTriangles) report.errors.push(`object ${object.path}#${object.id} is missing triangles`);
    if (inspection.vertexCount === 0) report.errors.push(`object ${object.path}#${object.id} has no vertices`);
    if (inspection.triangleCount === 0) report.errors.push(`object ${object.path}#${object.id} has no triangles`);
    const hadVertices = report.vertexCount > 0;
    if (inspection.vertexCount > 0) {
      updateBounds(report, inspection.boundsMin, hadVertices);
      updateBounds(report, inspection.boundsMax, true);
    }
    report.vertexCount += inspection.vertexCount;
    report.triangleCount += inspection.triangleCount;
    report.errors.push(...inspection.errors);
    report.warnings.push(...inspection.warnings);
    return true;
  }
  const mesh = child(object.element as XmlElement, "mesh");
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

async function inspectSettings(
  archive: ZipArchive,
  models: ParsedModel[],
  report: Skin3mfValidationReport,
): Promise<void> {
  if (!archive.entries.has("Metadata/model_settings.config")) {
    report.errors.push("missing required entry: Metadata/model_settings.config");
    return;
  }
  let settings: XmlElement;
  try {
    const settingsData = await materializeEntry(archive, "Metadata/model_settings.config");
    settings = parseXml(textFromBytes(settingsData, "Metadata/model_settings.config"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.errors.push(`${message.startsWith("ZIP ") ? "invalid 3MF ZIP container" : "malformed XML in Metadata/model_settings.config"}: ${message}`);
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
  execution: Skin3mfValidationExecutionOptions = {},
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

  const contentTypes = await parseXmlEntry(archive, "[Content_Types].xml", report.errors);
  if (contentTypes && localName(contentTypes.name) !== "Types") report.errors.push("[Content_Types].xml does not have a Types root element");
  const rootRelationships = await parseXmlEntry(archive, "_rels/.rels", report.errors);
  const rootRelationshipTargets = relationshipTargets(rootRelationships, "/", report.errors, "_rels/.rels", MODEL_RELATIONSHIP_TYPE);
  if (!rootRelationshipTargets.has("/3D/3dmodel.model")) report.errors.push("root relationships do not reference /3D/3dmodel.model");

  if (!archive.entries.has("3D/3dmodel.model")) return report;
  let rootData: Uint8Array;
  try { rootData = await materializeEntry(archive, "3D/3dmodel.model"); }
  catch (error) { report.errors.push(`invalid 3MF ZIP container: ${error instanceof Error ? error.message : String(error)}`); return report; }
  const rootModel = parseModel("/3D/3dmodel.model", rootData, report.errors);
  if (!rootModel) return report;
  report.unit = rootModel.unit;
  const expectedUnit = expected.expectedUnit ?? "millimeter";
  if (!rootModel.unit) report.errors.push("3D/3dmodel.model is missing unit");
  else if (rootModel.unit !== expectedUnit) report.errors.push(`unsupported unit: ${rootModel.unit} (expected ${expectedUnit})`);

  const modelRelationshipPath = relationshipFileFor("/3D/3dmodel.model").slice(1);
  const modelRelationships = await parseXmlEntry(archive, modelRelationshipPath, report.errors);
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
    if (!archive.entries.has(entryName)) {
      report.errors.push(`component references missing model XML: ${entryName}`);
      continue;
    }
    const model = await parseModelEntry(archive, entryName, reference.path, report.errors, execution);
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

  await inspectSettings(archive, [...modelsByPath.values()], report);
  for (const name of archive.entries.keys()) {
    if (archive.validated.has(name)) continue;
    try { await materializeEntry(archive, name); }
    catch (error) { report.errors.push(`invalid 3MF ZIP container: ${error instanceof Error ? error.message : String(error)}`); }
  }
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

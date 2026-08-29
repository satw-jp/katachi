// ---------------------------------------------------------------------------
// SKIN project checkpoint (.fkei)
//
// The file is deliberately a small, dependency-free envelope around the
// already validated SKIN facts.  Runtime objects (Workers, timers, renderer
// resources and active strokes) never enter this module.  Typed arrays use a
// tagged byte encoding so a checkpoint is deterministic and lossless for
// finite values.
// ---------------------------------------------------------------------------

import { validateArtworkGraph, type ArtworkGraph } from "./artworkGraph.ts";
import { validateSkinEditorViewDraft, type SkinEditorViewDraftV1 } from "./multiViewport.ts";
import {
  validateOverhangAssignmentLedger,
  type OverhangSupportPolicyResult,
} from "./overhangSupportPolicy.ts";
import {
  validateSupportPaint,
  type SupportPaintHistory,
  type SupportPaintMode,
} from "./supportPaint.ts";
import { validateSkinPrintProfile, type SkinPrintProfileV1 } from "./printProfile.ts";
import { DEFAULT_SKIN_HOST_PARAMS, type SkinHistoryEntry } from "./history.ts";
import { DEFAULT_SKIN_PARAMS } from "./field.ts";
import { isPatchEditIntent } from "./elementTransform.ts";
import type { SurfaceAngleWorkerMessage } from "./surfaceAngleWorkerProtocol.ts";
import type { SurfacePersistentCacheKeys } from "./surfaceAnglePersistentCache.ts";
import type { InternalStructureGraph } from "./voronoi.ts";
import type { DryWebRoutingFacts } from "./dryWebRouting.ts";
import type { OverhangDryWebTarget } from "./overhangSupportPolicy.ts";
import type {
  TargetedGridContactFloorFacts,
  TargetedGridTargetConnectionFact,
} from "./targetedGrid.ts";
import {
  validateFkeiCanonicalDryWebArtifact,
  fkeiCanonicalShapeSnapshotFingerprint,
  validateFkeiRiskDrivenLatticeArtifact,
  type FkeiCanonicalDryWebArtifact,
  type FkeiRiskDrivenLatticeArtifact,
} from "./fkeiRiskDrivenLattice.ts";

export const FKEI_SCHEMA = "katachi.skin.fkei.v1" as const;
export const FKEI_TYPED_ENCODING = "base64-binary-v1" as const;
export const FKEI_BINDING_MODEL = "canonical-currentness-v1" as const;

export type FkeiCompletedStage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface FkeiCompatibility {
  formatVersion: 1;
  studyId: "skin";
  typedEncoding: typeof FKEI_TYPED_ENCODING;
  bindingModel: typeof FKEI_BINDING_MODEL;
  appVersion?: string;
  generatorCommit?: string;
}

export interface FkeiSurfaceBinding {
  surfaceFingerprint: string;
  resolution: number;
  targetLongestMm: number;
  angleThresholdDeg: number;
  cacheKeys: SurfacePersistentCacheKeys | null;
}

export interface FkeiArtworkBinding {
  sourceKey: string;
  patchSetRevision: number;
}

/** Persisted identity facts for the existing Stage 7 canonical-candidate
 * adoption transition.  Runtime adoption stores these values alongside the
 * restored preview; they are not a new currentness predicate. */
export interface FkeiDryWebCanonicalAdoption {
  surfaceFingerprint: string;
  resolution: number;
  paintRevision: number;
  artworkGraphSourceKey: string;
  mode: "plate" | "window";
  supportSettingsKey: string;
  /** The generator-derived per-target facts retained when adoption drops the
   * live preview's copy.  Counts are always recomputed from these records. */
  targetConnectionFacts: TargetedGridTargetConnectionFact[];
  exactValidated: boolean;
}

export interface FkeiDryWebBinding {
  surfaceFingerprint: string;
  resolution: number;
  paintRevision: number;
  artworkGraphSourceKey: string;
  targetSourceResolution: number;
}

export interface FkeiBindingFacts {
  /** This is the existing canonical current-surface predicate input, not a new hash. */
  shapeFingerprint: string;
  patchSetRevision: number;
  paintRevision: number;
  surface?: FkeiSurfaceBinding;
  artworkGraph?: FkeiArtworkBinding;
  dryWeb?: FkeiDryWebBinding;
}

export interface FkeiShapeArtifact {
  formatVersion: 1;
  entries: SkinHistoryEntry[];
}

export interface FkeiSupportPaintArtifact {
  revision: number;
  history: SupportPaintHistory;
  mode: SupportPaintMode;
  radiusMm: number;
  paintBackfaces: boolean;
  enabled: boolean;
  editorView?: SkinEditorViewDraftV1;
}

export type SurfaceAngleResult = Extract<SurfaceAngleWorkerMessage, { type: "result" }>;

export interface FkeiSurfaceArtifact {
  diagnosis: SurfaceAngleResult;
  automaticSupportResult: OverhangSupportPolicyResult;
  effectiveSupportResult: OverhangSupportPolicyResult;
  binding: FkeiSurfaceBinding;
}

export interface FkeiDryWebPreviewArtifact {
  surfaceFingerprint: string;
  resolution: number;
  paintRevision: number;
  artworkGraphSnapshot: ArtworkGraph;
  artworkGraphSourceKey: string;
  graph: InternalStructureGraph;
  targetConnectionFacts: TargetedGridTargetConnectionFact[] | null;
  contactFloorFacts: TargetedGridContactFloorFacts | null;
  /** Null is only valid for the existing Stage 7 canonical adoption state. */
  facts: DryWebRoutingFacts | null;
  canonicalAdoption?: FkeiDryWebCanonicalAdoption;
  computeMs: number;
}

export interface FkeiDryWebArtifact {
  preview: FkeiDryWebPreviewArtifact;
  targetSource: {
    surfaceFingerprint: string;
    resolution: number;
    targets: Array<OverhangDryWebTarget>;
  };
  /** Exact post-attachment diagnosis.  Separation presentation is re-derived from it. */
  exactDiagnosis?: SurfaceAngleResult;
  exactBinding?: FkeiSurfaceBinding;
}

export interface FkeiPrintProfileArtifact {
  profile: SkinPrintProfileV1;
  text: string;
  filename?: string;
  sha256?: string;
}

export interface FkeiDocument {
  schema: typeof FKEI_SCHEMA;
  printApproval: false;
  savedAt: string;
  compatibility: FkeiCompatibility;
  bindings: FkeiBindingFacts;
  completedStage?: FkeiCompletedStage;
  shape: FkeiShapeArtifact;
  supportPaint?: FkeiSupportPaintArtifact;
  artworkGraph?: {
    snapshot: ArtworkGraph;
    sourceKey: string;
  };
  surface?: FkeiSurfaceArtifact;
  dryWeb?: FkeiDryWebArtifact;
  /** Compact, exact canonical adoption used only when full Dry Web evidence
   * is unavailable. It deliberately stores no face buffers or target reconstruction. */
  canonicalDryWeb?: FkeiCanonicalDryWebArtifact;
  /** Optional reviewed v0 lattice; this never advances completedStage. */
  riskDrivenLattice?: FkeiRiskDrivenLatticeArtifact;
  printProfile?: FkeiPrintProfileArtifact;
}

export interface FkeiCaptureInput extends Omit<FkeiDocument, "schema" | "printApproval" | "savedAt" | "compatibility"> {
  savedAt?: string;
  compatibility?: Partial<FkeiCompatibility>;
}

export type FkeiImportResult =
  | { kind: "fkei"; document: FkeiDocument }
  | { kind: "legacy"; entries: SkinHistoryEntry[] };

type EncodedValue =
  | null
  | boolean
  | string
  | number
  | { $fkei: "array"; items: EncodedValue[] }
  | { $fkei: "object"; entries: Array<[string, EncodedValue]> }
  | { $fkei: "typed-array"; name: TypedArrayName; length: number; byteLength: number; base64: string }
  | { $fkei: "array-buffer"; byteLength: number; base64: string };

type TypedArrayName =
  | "Int8Array" | "Uint8Array" | "Uint8ClampedArray" | "Int16Array" | "Uint16Array"
  | "Int32Array" | "Uint32Array" | "Float32Array" | "Float64Array";

type NumericTypedArray = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;
type NumericTypedArrayConstructor = {
  new (length: number): NumericTypedArray;
  new (buffer: ArrayBufferLike, byteOffset?: number, length?: number): NumericTypedArray;
  BYTES_PER_ELEMENT: number;
};

const TYPED_ARRAY_CTORS: Record<TypedArrayName, NumericTypedArrayConstructor> = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
};

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Hostile-input budgets. These leave room for realistic 128-resolution
 * Surface/Dry Web checkpoints while bounding browser allocations. */
export const FKEI_LIMITS = {
  maxJsonTextBytes: 128 * 1024 * 1024,
  maxDepth: 128,
  maxDecodedNodes: 2_000_000,
  maxSingleBinaryBytes: 64 * 1024 * 1024,
  maxAggregateBinaryBytes: 512 * 1024 * 1024,
} as const;

interface CodecBudget {
  nodes: number;
  aggregateBinaryBytes: number;
}

function newCodecBudget(): CodecBudget {
  return { nodes: 0, aggregateBinaryBytes: 0 };
}

function consumeNode(budget: CodecBudget, depth: number): void {
  if (depth > FKEI_LIMITS.maxDepth) throw new Error(`FKEI maximum recursive depth (${FKEI_LIMITS.maxDepth}) exceeded`);
  budget.nodes += 1;
  if (budget.nodes > FKEI_LIMITS.maxDecodedNodes) throw new Error(`FKEI maximum decoded nodes (${FKEI_LIMITS.maxDecodedNodes}) exceeded`);
}

function consumeBinary(budget: CodecBudget, byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw new Error("FKEI binary length is invalid");
  if (byteLength > FKEI_LIMITS.maxSingleBinaryBytes) throw new Error(`FKEI single binary payload exceeds ${FKEI_LIMITS.maxSingleBinaryBytes} bytes`);
  if (budget.aggregateBinaryBytes > FKEI_LIMITS.maxAggregateBinaryBytes - byteLength) throw new Error(`FKEI aggregate binary payload exceeds ${FKEI_LIMITS.maxAggregateBinaryBytes} bytes`);
  budget.aggregateBinaryBytes += byteLength;
}

function dangerousKey(key: string): boolean {
  return key === "__proto__" || key === "prototype" || key === "constructor";
}

function ownData(value: Record<string, unknown>, key: string, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) throw new Error(`${label}.${key} must be an own enumerable data property`);
  return descriptor.value;
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label} must be a plain object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(record)) {
    if (dangerousKey(key)) throw new Error(`${label} contains a dangerous key`);
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) throw new Error(`${label}.${key} must be an own enumerable data property`);
  }
  if (Object.getOwnPropertySymbols(record).length > 0) throw new Error(`${label} cannot contain symbol properties`);
  const safe = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(record)) Object.defineProperty(safe, key, {
    value: record[key], enumerable: true, writable: true, configurable: true,
  });
  return safe;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const known = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (dangerousKey(key)) throw new Error(`${label} contains a dangerous key`);
    ownData(value, key, label);
    if (!known.has(key)) throw new Error(`Unknown ${label} field: ${key}`);
  }
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function isTypedArrayName(value: unknown): value is TypedArrayName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TYPED_ARRAY_CTORS, value);
}

function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const a = bytes[offset];
    const hasB = offset + 1 < bytes.length;
    const hasC = offset + 2 < bytes.length;
    const b = hasB ? bytes[offset + 1] : 0;
    const c = hasC ? bytes[offset + 2] : 0;
    result += BASE64[a >> 2];
    result += BASE64[((a & 3) << 4) | (b >> 4)];
    result += hasB ? BASE64[((b & 15) << 2) | (c >> 6)] : "=";
    result += hasC ? BASE64[c & 63] : "=";
  }
  return result;
}

function base64ToBytes(value: unknown, declaredByteLength: number, label: string, budget: CodecBudget): Uint8Array {
  if (typeof value !== "string" || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`${label} is not valid base64`);
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const decodedLength = Math.floor(value.length / 4) * 3 - padding;
  if (decodedLength !== declaredByteLength) throw new Error(`${label} base64 length does not match declared bytes`);
  consumeBinary(budget, declaredByteLength);
  const bytes = new Uint8Array(declaredByteLength);
  let writeOffset = 0;
  for (let offset = 0; offset < value.length; offset += 4) {
    const a = BASE64.indexOf(value[offset]);
    const b = BASE64.indexOf(value[offset + 1]);
    const c = value[offset + 2] === "=" ? 0 : BASE64.indexOf(value[offset + 2]);
    const d = value[offset + 3] === "=" ? 0 : BASE64.indexOf(value[offset + 3]);
    if (writeOffset < bytes.length) bytes[writeOffset++] = (a << 2) | (b >> 4);
    if (value[offset + 2] !== "=" && writeOffset < bytes.length) bytes[writeOffset++] = ((b & 15) << 4) | (c >> 2);
    if (value[offset + 3] !== "=" && writeOffset < bytes.length) bytes[writeOffset++] = ((c & 3) << 6) | d;
  }
  if (writeOffset !== bytes.length || bytesToBase64(bytes) !== value) throw new Error(`${label} is not canonical base64`);
  return bytes;
}

function encodeTypedArray(value: ArrayBufferView, name: TypedArrayName, budget: CodecBudget): EncodedValue {
  const typed = value as unknown as { [index: number]: unknown; length: number };
  const length = typed.length;
  const byteLength = length * TYPED_ARRAY_CTORS[name].BYTES_PER_ELEMENT;
  consumeBinary(budget, byteLength);
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < length; index += 1) {
    const item = typed[index];
    if (typeof item !== "number" || !Number.isFinite(item)) throw new Error(`FKEI ${name} contains a non-finite value`);
    const offset = index * TYPED_ARRAY_CTORS[name].BYTES_PER_ELEMENT;
    switch (name) {
      case "Int8Array": view.setInt8(offset, item); break;
      case "Uint8Array": case "Uint8ClampedArray": view.setUint8(offset, item); break;
      case "Int16Array": view.setInt16(offset, item, true); break;
      case "Uint16Array": view.setUint16(offset, item, true); break;
      case "Int32Array": view.setInt32(offset, item, true); break;
      case "Uint32Array": view.setUint32(offset, item, true); break;
      case "Float32Array": view.setFloat32(offset, item, true); break;
      case "Float64Array": view.setFloat64(offset, item, true); break;
    }
  }
  // `consumeBinary` above is the bound check; the encoded bytes are a fresh
  // portable little-endian representation, independent of backing subviews.
  return { $fkei: "typed-array", name, length, byteLength, base64: bytesToBase64(bytes) };
}

function typedArrayName(value: ArrayBufferView): TypedArrayName | null {
  for (const name of Object.keys(TYPED_ARRAY_CTORS) as TypedArrayName[]) {
    if (value instanceof TYPED_ARRAY_CTORS[name]) return name;
  }
  return null;
}

/** Encode a value recursively. This is exported for focused codec tests. */
export function encodeFkeiValue(value: unknown, seen = new WeakSet<object>(), budget = newCodecBudget(), depth = 0): EncodedValue {
  consumeNode(budget, depth);
  if (value === null || typeof value === "boolean" || typeof value === "string") return value as null | boolean | string;
  if (typeof value === "number") return finiteNumber(value, "FKEI number");
  if (value === undefined || typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    throw new Error("FKEI cannot encode undefined, bigint, function, or symbol values");
  }
  if (typeof value !== "object") throw new Error("FKEI cannot encode this value");
  if (seen.has(value)) throw new Error("FKEI cannot encode cyclic values");
  seen.add(value);
  try {
    if (value instanceof ArrayBuffer) {
      consumeBinary(budget, value.byteLength);
      const bytes = new Uint8Array(value.slice(0));
      return { $fkei: "array-buffer", byteLength: bytes.byteLength, base64: bytesToBase64(bytes) };
    }
    if (ArrayBuffer.isView(value)) {
      const view = value as ArrayBufferView;
      const name = typedArrayName(view);
      if (!name) throw new Error("FKEI does not support DataView or bigint typed arrays");
      return encodeTypedArray(view, name, budget);
    }
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("FKEI arrays cannot contain symbol properties");
      if (value.length > FKEI_LIMITS.maxDecodedNodes - budget.nodes) throw new Error("FKEI array exceeds decoded collection budget");
      for (const key of Object.getOwnPropertyNames(value)) {
        if (key === "length") continue;
        if (!/^\d+$/.test(key) || Number(key) >= value.length) throw new Error("FKEI arrays cannot contain custom enumerable fields");
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) throw new Error("FKEI array items must be enumerable data properties");
      }
      const items: EncodedValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) throw new Error("FKEI cannot encode sparse arrays");
        items.push(encodeFkeiValue(value[index], seen, budget, depth + 1));
      }
      return { $fkei: "array", items };
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("FKEI only accepts plain objects");
    for (const key of Object.getOwnPropertyNames(value)) {
      if (dangerousKey(key)) throw new Error("FKEI object contains a dangerous key");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) throw new Error(`FKEI ${key} must be an enumerable data property`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("FKEI objects cannot contain symbol properties");
    const entries: Array<[string, EncodedValue]> = [];
    for (const key of Object.keys(value)) {
      if (key === "$fkei") throw new Error("FKEI reserved key cannot be used in an object");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) throw new Error(`FKEI ${key} must be an enumerable data property`);
      // Optional runtime fields with an own undefined value have the same
      // object semantics as JSON: omit them. Array items remain strict.
      if (descriptor.value === undefined) continue;
      entries.push([key, encodeFkeiValue(descriptor.value, seen, budget, depth + 1)]);
    }
    entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return { $fkei: "object", entries };
  } finally {
    seen.delete(value);
  }
}

/** Decode a tagged value and reject unknown tags, malformed lengths and bytes. */
export function decodeFkeiValue(value: unknown, budget = newCodecBudget(), depth = 0): unknown {
  consumeNode(budget, depth);
  if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number") {
    if (typeof value === "number") finiteNumber(value, "FKEI number");
    return value;
  }
  const root = objectRecord(value, "FKEI encoded value");
  const tag = root.$fkei;
  if (tag === "array") {
    if (Object.keys(root).length !== 2 || !Array.isArray(root.items)) throw new Error("Malformed FKEI array tag");
    if (root.items.length > FKEI_LIMITS.maxDecodedNodes - budget.nodes) throw new Error("FKEI array exceeds decoded collection budget");
    const result: unknown[] = [];
    for (let index = 0; index < root.items.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(root.items, index)) throw new Error("Malformed FKEI array items");
      result.push(decodeFkeiValue(root.items[index], budget, depth + 1));
    }
    return result;
  }
  if (tag === "object") {
    if (Object.keys(root).length !== 2 || !Array.isArray(root.entries)) throw new Error("Malformed FKEI object tag");
    if (root.entries.length > FKEI_LIMITS.maxDecodedNodes - budget.nodes) throw new Error("FKEI object exceeds decoded collection budget");
    const result = Object.create(null) as Record<string, unknown>;
    for (const entry of root.entries) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || entry[0] === "$fkei" || Object.prototype.hasOwnProperty.call(result, entry[0])) {
        throw new Error("Malformed FKEI object entry");
      }
      Object.defineProperty(result, entry[0], { value: decodeFkeiValue(entry[1], budget, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return result;
  }
  if (tag === "array-buffer") {
    if (Object.keys(root).length !== 3) throw new Error("Malformed FKEI ArrayBuffer tag");
    const byteLength = nonNegativeInteger(root.byteLength, "FKEI ArrayBuffer byteLength");
    const bytes = base64ToBytes(root.base64, byteLength, "FKEI ArrayBuffer", budget);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  if (tag === "typed-array") {
    if (Object.keys(root).length !== 5 || !isTypedArrayName(root.name)) throw new Error("Malformed FKEI typed-array tag");
    const ctor = TYPED_ARRAY_CTORS[root.name];
    const length = nonNegativeInteger(root.length, "FKEI typed-array length");
    const byteLength = nonNegativeInteger(root.byteLength, "FKEI typed-array byteLength");
    if (byteLength !== length * ctor.BYTES_PER_ELEMENT) throw new Error("FKEI typed-array length is inconsistent");
    const bytes = base64ToBytes(root.base64, byteLength, "FKEI typed-array", budget);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const result = new ctor(length);
    for (let index = 0; index < length; index += 1) {
      const offset = index * ctor.BYTES_PER_ELEMENT;
      let item: number;
      switch (root.name) {
        case "Int8Array": item = view.getInt8(offset); break;
        case "Uint8Array": case "Uint8ClampedArray": item = view.getUint8(offset); break;
        case "Int16Array": item = view.getInt16(offset, true); break;
        case "Uint16Array": item = view.getUint16(offset, true); break;
        case "Int32Array": item = view.getInt32(offset, true); break;
        case "Uint32Array": item = view.getUint32(offset, true); break;
        case "Float32Array": item = view.getFloat32(offset, true); break;
        case "Float64Array": item = view.getFloat64(offset, true); break;
      }
      if (!Number.isFinite(item)) throw new Error("FKEI typed-array contains a non-finite value");
      result[index] = item;
    }
    return result;
  }
  throw new Error(`Unknown FKEI tag: ${String(tag)}`);
}

function cloneValue<T>(value: T): T {
  return decodeFkeiValue(encodeFkeiValue(value)) as T;
}

function assertJsonTextBudget(text: string): void {
  if (utf8ByteLength(text) > FKEI_LIMITS.maxJsonTextBytes) throw new Error(`FKEI JSON text exceeds ${FKEI_LIMITS.maxJsonTextBytes} bytes`);
}

/** Dependency-free UTF-8 byte length used by both parse and serialize limits. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const low = text.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) { bytes += 4; index += 1; }
      else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

function validateBinding(binding: unknown, label: string): FkeiBindingFacts {
  const root = objectRecord(binding, label);
  onlyKeys(root, ["shapeFingerprint", "patchSetRevision", "paintRevision", "surface", "artworkGraph", "dryWeb"], label);
  const shapeFingerprint = nonEmptyString(root.shapeFingerprint, `${label}.shapeFingerprint`);
  const patchSetRevision = nonNegativeInteger(root.patchSetRevision, `${label}.patchSetRevision`);
  const paintRevision = nonNegativeInteger(root.paintRevision, `${label}.paintRevision`);
  const validateSurfaceBinding = (value: unknown, nestedLabel: string): FkeiSurfaceBinding => {
    const item = objectRecord(value, nestedLabel);
    onlyKeys(item, ["surfaceFingerprint", "resolution", "targetLongestMm", "angleThresholdDeg", "cacheKeys"], nestedLabel);
    const cacheKeys = item.cacheKeys === null ? null : cloneValue(item.cacheKeys);
    if (cacheKeys !== null) {
      const keys = objectRecord(cacheKeys, `${nestedLabel}.cacheKeys`);
      onlyKeys(keys, ["meshKey", "diagnosisKey", "meshComponents", "diagnosisComponents"], `${nestedLabel}.cacheKeys`);
      nonEmptyString(keys.meshKey, `${nestedLabel}.cacheKeys.meshKey`);
      nonEmptyString(keys.diagnosisKey, `${nestedLabel}.cacheKeys.diagnosisKey`);
      const mesh = objectRecord(keys.meshComponents, `${nestedLabel}.cacheKeys.meshComponents`); onlyKeys(mesh, ["stableShapeFingerprint", "resolution", "surfaceGenerationAlgorithmVersion"], `${nestedLabel}.cacheKeys.meshComponents`); nonEmptyString(mesh.stableShapeFingerprint, "surface mesh stableShapeFingerprint"); nonNegativeInteger(mesh.resolution, "surface mesh resolution"); nonEmptyString(mesh.surfaceGenerationAlgorithmVersion, "surface mesh algorithm version");
      const diagnosis = objectRecord(keys.diagnosisComponents, `${nestedLabel}.cacheKeys.diagnosisComponents`); onlyKeys(diagnosis, ["surfaceMeshKey", "targetLongestMm", "angleThresholdDeg", "supportClassificationPolicyVersion", "rayEpsilonVersion"], `${nestedLabel}.cacheKeys.diagnosisComponents`); nonEmptyString(diagnosis.surfaceMeshKey, "surface diagnosis mesh key"); if (!(finiteNumber(diagnosis.targetLongestMm, "surface diagnosis targetLongestMm") > 0) || !(finiteNumber(diagnosis.angleThresholdDeg, "surface diagnosis angleThresholdDeg") >= 0)) throw new Error("surface diagnosis cache components are invalid"); nonEmptyString(diagnosis.supportClassificationPolicyVersion, "surface diagnosis policy version"); nonEmptyString(diagnosis.rayEpsilonVersion, "surface diagnosis ray epsilon version");
      if (mesh.resolution !== item.resolution) throw new Error(`${nestedLabel}.cacheKeys.meshComponents.resolution does not match binding`);
      if (diagnosis.surfaceMeshKey !== keys.meshKey) throw new Error(`${nestedLabel}.cacheKeys.diagnosisComponents.surfaceMeshKey does not match meshKey`);
      if (diagnosis.targetLongestMm !== item.targetLongestMm) throw new Error(`${nestedLabel}.cacheKeys.diagnosisComponents.targetLongestMm does not match binding`);
      if (diagnosis.angleThresholdDeg !== item.angleThresholdDeg) throw new Error(`${nestedLabel}.cacheKeys.diagnosisComponents.angleThresholdDeg does not match binding`);
    }
    if (!(item.resolution as number > 0) || !(item.targetLongestMm as number > 0) || !(item.angleThresholdDeg as number >= 0)) throw new Error(`${nestedLabel} numeric binding facts are invalid`);
    return {
      surfaceFingerprint: nonEmptyString(item.surfaceFingerprint, `${nestedLabel}.surfaceFingerprint`),
      resolution: nonNegativeInteger(item.resolution, `${nestedLabel}.resolution`),
      targetLongestMm: finiteNumber(item.targetLongestMm, `${nestedLabel}.targetLongestMm`),
      angleThresholdDeg: finiteNumber(item.angleThresholdDeg, `${nestedLabel}.angleThresholdDeg`),
      cacheKeys: cacheKeys as SurfacePersistentCacheKeys | null,
    };
  };
  const surface = root.surface === undefined ? undefined : validateSurfaceBinding(root.surface, `${label}.surface`);
  let artworkGraph: FkeiArtworkBinding | undefined;
  if (root.artworkGraph !== undefined) {
    const item = objectRecord(root.artworkGraph, `${label}.artworkGraph`);
    onlyKeys(item, ["sourceKey", "patchSetRevision"], `${label}.artworkGraph`);
    artworkGraph = { sourceKey: nonEmptyString(item.sourceKey, `${label}.artworkGraph.sourceKey`), patchSetRevision: nonNegativeInteger(item.patchSetRevision, `${label}.artworkGraph.patchSetRevision`) };
  }
  let dryWeb: FkeiDryWebBinding | undefined;
  if (root.dryWeb !== undefined) {
    const item = objectRecord(root.dryWeb, `${label}.dryWeb`);
    onlyKeys(item, ["surfaceFingerprint", "resolution", "paintRevision", "artworkGraphSourceKey", "targetSourceResolution"], `${label}.dryWeb`);
    dryWeb = {
      surfaceFingerprint: nonEmptyString(item.surfaceFingerprint, `${label}.dryWeb.surfaceFingerprint`),
      resolution: nonNegativeInteger(item.resolution, `${label}.dryWeb.resolution`),
      paintRevision: nonNegativeInteger(item.paintRevision, `${label}.dryWeb.paintRevision`),
      artworkGraphSourceKey: nonEmptyString(item.artworkGraphSourceKey, `${label}.dryWeb.artworkGraphSourceKey`),
      targetSourceResolution: nonNegativeInteger(item.targetSourceResolution, `${label}.dryWeb.targetSourceResolution`),
    };
  }
  return { shapeFingerprint, patchSetRevision, paintRevision, ...(surface ? { surface } : {}), ...(artworkGraph ? { artworkGraph } : {}), ...(dryWeb ? { dryWeb } : {}) };
}

const SKIN_OPS = new Set([
  "growHost", "setHostParam", "loadHostFromS1Recipe", "setSkinParam", "packPatches", "applySurfacePreset",
  "addPatch", "removePatch", "editPatch", "reshapePatch", "clearPatches", "setMode", "confirmPartition",
  "confirmNPartition", "clearPartition", "setAnnotation", "removeAnnotation", "clearAll",
]);

/** String-valued SkinParams are closed unions in field.ts, except seed which
 * is an author-controlled non-empty string. Keeping this table adjacent to
 * the persisted validator prevents a truthy string from becoming a future
 * enum value by accident. */
const SKIN_ENUM_VALUES: Readonly<Record<string, readonly string[]>> = {
  patchShape: ["coin", "flatRing", "ring3d", "flower"],
  motifPlacement: ["surface", "center", "inside"],
  surfaceGenerationMode: ["randomPack", "quadFlow", "voronoi", "goldberg"],
  quadTilingMode: ["regular", "varied", "field"],
  quadConnectionMode: ["separate", "local"],
  laceMotifPlacement: ["surface", "center", "inside"],
  contactReinforcementMode: ["localPoints", "wholeMotif"],
  flowerMotifPreset: ["four-core", "six-core", "ten-ring", "twelve-core", "custom"],
  flowerConnectionMode: ["separate", "fused", "direct"],
  internalStructure: ["none", "targetedGrid", "voronoiEdge"],
};

const SKIN_BOOLEAN_KEYS = new Set(["flowerShowCore"]);

function validateSkinParamValue(key: string, value: unknown, label: string): void {
  const enumValues = SKIN_ENUM_VALUES[key];
  if (enumValues) {
    if (typeof value !== "string" || !enumValues.includes(value)) throw new Error(`${label}.${key} has an unsupported enum value`);
    return;
  }
  if (key === "seed") {
    nonEmptyString(value, `${label}.${key}`);
    return;
  }
  if (SKIN_BOOLEAN_KEYS.has(key)) {
    if (typeof value !== "boolean") throw new Error(`${label}.${key} must be boolean`);
    return;
  }
  const numeric = finiteNumber(value, `${label}.${key}`);
  // These domains are explicit in the current field/UI contract. Other
  // numeric controls remain finite-only because their generators normalize
  // them (e.g. round/count clamping) at use sites.
  if (key === "irregularity" && (numeric < 0 || numeric > 1)) throw new Error(`${label}.${key} is outside 0..1`);
  if ((key === "coinHoleRatio" || key === "flatRingHoleRatio") && (numeric < 0 || numeric > 0.95)) throw new Error(`${label}.${key} is outside 0..0.95`);
  if (key === "flowerPetalCount" && (!Number.isSafeInteger(numeric) || numeric < 3 || numeric > 12)) throw new Error(`${label}.${key} is outside 3..12`);
}

function validateSkinParamsRecord(value: unknown, label: string, required: boolean): Record<string, unknown> {
  const root = objectRecord(value, label);
  const keys = Object.keys(DEFAULT_SKIN_PARAMS);
  onlyKeys(root, keys, label);
  if (required) for (const key of keys) if (!Object.prototype.hasOwnProperty.call(root, key)) throw new Error(`${label}.${key} is required`);
  for (const [key, current] of Object.entries(root)) validateSkinParamValue(key, current, label);
  return root;
}

function validateParamRecord(value: unknown, label: string, keys: ReadonlySet<string>, required: boolean): Record<string, unknown> {
  const root = objectRecord(value, label);
  onlyKeys(root, [...keys], label);
  if (required) for (const key of keys) if (!Object.prototype.hasOwnProperty.call(root, key)) throw new Error(`${label}.${key} is required`);
  for (const [key, current] of Object.entries(root)) {
    if (key === "seed" || key === "patchShape" || key === "motifPlacement" || key === "surfaceGenerationMode" || key === "quadTilingMode" || key === "quadConnectionMode" || key === "contactReinforcementMode" || key === "flowerMotifPreset" || key === "flowerConnectionMode" || key === "laceMotifPlacement") {
      nonEmptyString(current, `${label}.${key}`);
    } else if (typeof current === "boolean") {
      // Boolean Skin parameters are valid and already type constrained.
    } else {
      finiteNumber(current, `${label}.${key}`);
    }
  }
  return root;
}

function validateLegacyBalls(value: unknown, label: string): void {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  if (value.length > FKEI_LIMITS.maxDecodedNodes) throw new Error(`${label} exceeds FKEI collection budget`);
  for (let index = 0; index < value.length; index += 1) {
    const ball = objectRecord(value[index], `${label}[${index}]`);
    onlyKeys(ball, ["id", "x", "y", "z", "r"], `${label}[${index}]`);
    nonNegativeInteger(ball.id, `${label}[${index}].id`);
    finiteNumber(ball.x, `${label}[${index}].x`); finiteNumber(ball.y, `${label}[${index}].y`); finiteNumber(ball.z, `${label}[${index}].z`);
    if (!(finiteNumber(ball.r, `${label}[${index}].r`) > 0)) throw new Error(`${label}[${index}].r must be positive`);
  }
}

function validateLegacyEntries(value: unknown): SkinHistoryEntry[] {
  if (!Array.isArray(value)) throw new Error("legacy Shape Recipe entries must be an array");
  if (value.length > FKEI_LIMITS.maxDecodedNodes) throw new Error("legacy Shape Recipe exceeds FKEI collection budget");
  const hostKeys = new Set(Object.keys(DEFAULT_SKIN_HOST_PARAMS));
  const skinKeys = new Set(Object.keys(DEFAULT_SKIN_PARAMS));
  const cloned = cloneValue(value) as unknown[];
  for (let index = 0; index < cloned.length; index += 1) {
    const entry = objectRecord(cloned[index], `legacy entries[${index}]`);
    onlyKeys(entry, ["t", "op", "args"], `legacy entries[${index}]`);
    if (!(finiteNumber(entry.t, `legacy entries[${index}].t`) >= 0)) throw new Error(`legacy entries[${index}].t must be non-negative`);
    if (typeof entry.op !== "string" || !SKIN_OPS.has(entry.op)) throw new Error(`legacy entries[${index}].op is unsupported`);
    const args = objectRecord(entry.args, `legacy entries[${index}].args`);
    switch (entry.op) {
      case "growHost":
        onlyKeys(args, ["params"], "growHost args");
        validateParamRecord(args.params, "growHost.params", hostKeys, true);
        break;
      case "setHostParam":
        onlyKeys(args, ["key", "value"], "setHostParam args");
        if (typeof args.key !== "string" || !hostKeys.has(args.key)) throw new Error("setHostParam.key is unsupported");
        if (args.key === "seed") nonEmptyString(args.value, "setHostParam.value"); else finiteNumber(args.value, "setHostParam.value");
        break;
      case "loadHostFromS1Recipe":
        onlyKeys(args, ["balls", "params", "source"], "loadHostFromS1Recipe args");
        validateLegacyBalls(args.balls, "loadHostFromS1Recipe.balls");
        validateParamRecord(args.params, "loadHostFromS1Recipe.params", hostKeys, true);
        if (args.source !== undefined) nonEmptyString(args.source, "loadHostFromS1Recipe.source");
        break;
      case "setSkinParam":
        onlyKeys(args, ["key", "value"], "setSkinParam args");
        if (typeof args.key !== "string" || !skinKeys.has(args.key)) throw new Error("setSkinParam.key is unsupported");
        validateSkinParamValue(args.key, args.value, "setSkinParam.value");
        break;
      case "packPatches": case "applySurfacePreset":
        onlyKeys(args, entry.op === "packPatches" ? ["patches", "identity"] : ["presetId", "params", "patches"], `${entry.op} args`);
        if (!Array.isArray(args.patches)) throw new Error(`${entry.op}.patches must be an array`);
        if (entry.op === "packPatches" && args.identity !== undefined && args.identity !== "replace" && args.identity !== "preserve") throw new Error("packPatches.identity is invalid");
        if (entry.op === "applySurfacePreset") {
          if (args.presetId !== "dense-flower-v6-style") throw new Error("applySurfacePreset.presetId is unsupported");
          validateSkinParamsRecord(args.params, "applySurfacePreset.params", true);
        }
        break;
      case "addPatch": case "removePatch": case "editPatch": case "reshapePatch":
        onlyKeys(args, entry.op === "removePatch" ? ["id"] : entry.op === "reshapePatch" ? ["patch", "params"] : ["patch", ...(entry.op === "editPatch" ? ["intent"] : [])], `${entry.op} args`);
        if (entry.op === "removePatch") nonNegativeInteger(args.id, "removePatch.id");
        else {
          if (!args.patch || typeof args.patch !== "object") throw new Error(`${entry.op}.patch is required`);
          if (entry.op === "reshapePatch") validateParamRecord(args.params, "reshapePatch.params", new Set(["irregularity", "coinHoleRatio", "flatRingHoleRatio", "ringNodeCount", "ringTubeR", "ringWobbleR", "ringWobblePos", "flowerMotifPreset", "flowerPetalCount", "flowerShowCore", "flowerOpening", "flowerNeck", "flowerCoreSize", "flowerCupping", "flowerCoreLift", "flowerGrowthDifference", "flowerExpansion"]), false);
          if (entry.op === "editPatch" && !isPatchEditIntent(args.intent)) throw new Error("editPatch.intent is invalid");
        }
        break;
      case "clearPatches": case "clearPartition": case "clearAll":
        onlyKeys(args, [], `${entry.op} args`); break;
      case "setMode":
        onlyKeys(args, ["mode"], "setMode args"); if (args.mode !== "plate" && args.mode !== "window") throw new Error("setMode.mode is invalid"); break;
      case "confirmPartition": case "confirmNPartition":
        onlyKeys(args, ["selection"], `${entry.op} args`); if (!args.selection || typeof args.selection !== "object") throw new Error(`${entry.op}.selection is required`); break;
      case "setAnnotation":
        onlyKeys(args, ["reference", "value"], "setAnnotation args"); if (!args.reference || !args.value || typeof args.reference !== "object" || typeof args.value !== "object") throw new Error("setAnnotation arguments are invalid"); break;
      case "removeAnnotation":
        onlyKeys(args, ["reference"], "removeAnnotation args"); if (!args.reference || typeof args.reference !== "object") throw new Error("removeAnnotation.reference is required"); break;
    }
  }
  return cloned as SkinHistoryEntry[];
}

function validateShape(value: unknown): FkeiShapeArtifact {
  const root = objectRecord(value, "shape");
  onlyKeys(root, ["formatVersion", "entries"], "shape");
  if (root.formatVersion !== 1 || !Array.isArray(root.entries)) throw new Error("shape must retain history formatVersion 1 and entries");
  const entries = validateLegacyEntries(root.entries);
  return { formatVersion: 1, entries };
}

function validateSupportPaintArtifact(value: unknown): FkeiSupportPaintArtifact {
  const root = objectRecord(value, "supportPaint");
  onlyKeys(root, ["revision", "history", "mode", "radiusMm", "paintBackfaces", "enabled", "editorView"], "supportPaint");
  const revision = nonNegativeInteger(root.revision, "supportPaint.revision");
  if (root.activeStroke !== undefined) throw new Error("active Support Paint strokes are not persistable");
  const historyRoot = objectRecord(root.history, "supportPaint.history");
  onlyKeys(historyRoot, ["past", "present", "future"], "supportPaint.history");
  if (!Array.isArray(historyRoot.past) || !Array.isArray(historyRoot.future)) throw new Error("supportPaint history is malformed");
  const history: SupportPaintHistory = {
    past: historyRoot.past.map((paint) => validateSupportPaint(paint)),
    present: validateSupportPaint(historyRoot.present),
    future: historyRoot.future.map((paint) => validateSupportPaint(paint)),
  };
  if (root.mode !== "inside" && root.mode !== "outside" && root.mode !== "auto") throw new Error("supportPaint.mode is invalid");
  const radiusMm = finiteNumber(root.radiusMm, "supportPaint.radiusMm");
  if (!(radiusMm > 0)) throw new Error("supportPaint.radiusMm must be positive");
  if (typeof root.paintBackfaces !== "boolean" || typeof root.enabled !== "boolean") throw new Error("supportPaint settings are invalid");
  const editorView = root.editorView === undefined ? undefined : validateSkinEditorViewDraft(root.editorView);
  return { revision, history, mode: root.mode, radiusMm, paintBackfaces: root.paintBackfaces, enabled: root.enabled, ...(editorView ? { editorView } : {}) };
}

function validateSurfaceDiagnosis(value: unknown, label: string): SurfaceAngleResult {
  const root = objectRecord(value, label);
  onlyKeys(root, ["type", "generation", "metrics", "basePositions", "baseNormals", "baseFaceCount", "resolution", "internalEdgeCount", "motifLowestPoints", "beforeDangerPositions", "afterDangerPositions", "mitigatedPositions", "elapsedMs", "recheckAudit"], label);
  if (root.type !== "result") throw new Error(`${label}.type must be result`);
  for (const key of ["generation", "baseFaceCount", "resolution", "internalEdgeCount"] as const) nonNegativeInteger(root[key], `${label}.${key}`);
  if (!(finiteNumber(root.elapsedMs, `${label}.elapsedMs`) >= 0)) throw new Error(`${label}.elapsedMs must be non-negative`);
  for (const key of ["basePositions", "baseNormals", "beforeDangerPositions", "afterDangerPositions", "mitigatedPositions"] as const) {
    if (!(root[key] instanceof Float32Array)) throw new Error(`${label}.${key} must be Float32Array`);
    for (const item of root[key] as Float32Array) if (!Number.isFinite(item)) throw new Error(`${label}.${key} contains non-finite values`);
  }
  const basePositions = root.basePositions as Float32Array;
  const baseNormals = root.baseNormals as Float32Array;
  const before = root.beforeDangerPositions as Float32Array;
  const after = root.afterDangerPositions as Float32Array;
  const mitigated = root.mitigatedPositions as Float32Array;
  if (basePositions.length % 9 !== 0 || before.length % 9 !== 0 || after.length % 9 !== 0 || mitigated.length % 9 !== 0) throw new Error(`${label} triangle buffers must have lengths divisible by 9`);
  if (baseNormals.length !== basePositions.length || root.baseFaceCount !== basePositions.length / 9) throw new Error(`${label} base normal/face counts do not match base positions`);
  if (!Array.isArray(root.motifLowestPoints)) throw new Error(`${label}.motifLowestPoints must be an array`);
  for (let index = 0; index < root.motifLowestPoints.length; index += 1) {
    const marker = objectRecord(root.motifLowestPoints[index], `${label}.motifLowestPoints[${index}]`);
    onlyKeys(marker, ["patchId", "shape", "sourcePointIndex", "position", "normal", "markerRadius", "reachedByInternal", "basis"], `${label}.motifLowestPoints[${index}]`);
    nonNegativeInteger(marker.patchId, `${label}.motifLowestPoints[${index}].patchId`);
    if (marker.shape !== "coin" && marker.shape !== "flatRing" && marker.shape !== "ring3d" && marker.shape !== "flower") throw new Error(`${label}.motifLowestPoints[${index}].shape is invalid`);
    if (marker.sourcePointIndex !== undefined) nonNegativeInteger(marker.sourcePointIndex, `${label}.motifLowestPoints[${index}].sourcePointIndex`);
    const position = objectRecord(marker.position, `${label}.motifLowestPoints[${index}].position`);
    finiteNumber(position.x, `${label}.motifLowestPoints[${index}].position.x`); finiteNumber(position.y, `${label}.motifLowestPoints[${index}].position.y`); finiteNumber(position.z, `${label}.motifLowestPoints[${index}].position.z`);
    if (marker.normal !== undefined) {
      const normal = objectRecord(marker.normal, `${label}.motifLowestPoints[${index}].normal`);
      finiteNumber(normal.x, `${label}.motifLowestPoints[${index}].normal.x`); finiteNumber(normal.y, `${label}.motifLowestPoints[${index}].normal.y`); finiteNumber(normal.z, `${label}.motifLowestPoints[${index}].normal.z`);
    }
    if (!(finiteNumber(marker.markerRadius, `${label}.motifLowestPoints[${index}].markerRadius`) >= 0) || typeof marker.reachedByInternal !== "boolean" || (marker.basis !== "sourceSphere" && marker.basis !== "finalMesh")) throw new Error(`${label}.motifLowestPoints[${index}] has invalid marker facts`);
  }
  const metrics = objectRecord(root.metrics, `${label}.metrics`);
  onlyKeys(metrics, ["thresholdDeg", "surfaceArea", "dangerousAreaBefore", "dangerousAreaAfter", "mitigatedArea", "dangerousFaceCountBefore", "dangerousFaceCountAfter", "mitigatedFaceCount", "contactTolerance"], `${label}.metrics`);
  if (finiteNumber(metrics.thresholdDeg, `${label}.metrics.thresholdDeg`) > 90) throw new Error(`${label}.metrics.thresholdDeg exceeds runtime range`);
  for (const key of ["surfaceArea", "dangerousAreaBefore", "dangerousAreaAfter", "mitigatedArea", "contactTolerance"] as const) if (!(finiteNumber(metrics[key], `${label}.metrics.${key}`) >= 0)) throw new Error(`${label}.metrics.${key} must be non-negative`);
  for (const key of ["dangerousFaceCountBefore", "dangerousFaceCountAfter", "mitigatedFaceCount"] as const) nonNegativeInteger(metrics[key], `${label}.metrics.${key}`);
  if (metrics.dangerousFaceCountBefore !== before.length / 9
    || metrics.dangerousFaceCountAfter !== after.length / 9
    || metrics.mitigatedFaceCount !== mitigated.length / 9) {
    throw new Error(`${label} face counts do not match triangle buffers`);
  }
  if (metrics.dangerousFaceCountAfter + metrics.mitigatedFaceCount !== metrics.dangerousFaceCountBefore) {
    throw new Error(`${label} face counts violate diagnosis partition`);
  }
  if (root.recheckAudit !== undefined) {
    const audit = objectRecord(root.recheckAudit, `${label}.recheckAudit`);
    onlyKeys(audit, ["requestedMode", "mode", "queryFaceCount", "baselineBeforeDangerFaceCount", "baselineAfterDangerFaceCount", "monotonicProof", "fallbackReason"], `${label}.recheckAudit`);
    if ((audit.requestedMode !== "full" && audit.requestedMode !== "delta") || (audit.mode !== "full" && audit.mode !== "delta")) throw new Error(`${label}.recheckAudit mode is invalid`);
    for (const key of ["queryFaceCount", "baselineBeforeDangerFaceCount", "baselineAfterDangerFaceCount"] as const) nonNegativeInteger(audit[key], `${label}.recheckAudit.${key}`);
    if (audit.monotonicProof !== "passed" && audit.monotonicProof !== "failed" && audit.monotonicProof !== "not-requested") throw new Error(`${label}.recheckAudit.monotonicProof is invalid`);
    if (audit.fallbackReason !== undefined && audit.fallbackReason !== "proof-failed" && audit.fallbackReason !== "baseline-invalid" && audit.fallbackReason !== "composition-mismatch") throw new Error(`${label}.recheckAudit.fallbackReason is invalid`);
  }
  return cloneValue(value) as SurfaceAngleResult;
}

function validateSupportResult(value: unknown, label: string): OverhangSupportPolicyResult {
  const root = objectRecord(value, label);
  onlyKeys(root, ["policy", "entries", "counts", "baseFootprint", "rayFacts", "paintFacts", "outsideFacePositionsMm", "outsideExplicitTargetsMm", "insideTargets", "diagnosedFacePositionsMm", "mixedFaceIndices"], label);
  if (root.policy !== "downward-surface-ray-outside-scaffold-inside-dry-web-v2") throw new Error(`${label}.policy is invalid`);
  if (!Array.isArray(root.entries)) throw new Error(`${label}.entries must be an array`);
  const ids = new Set<string>();
  const entries = root.entries.map((raw, index) => {
    const entry = objectRecord(raw, `${label}.entries[${index}]`);
    onlyKeys(entry, ["id", "source", "sourceIndex", "siteIndex", "faceIndex", "classification", "positionMm", "patchId", "normal", "contactRadiusMm", "contactOverlapMm", "duplicateOf", "reason", "rayResult", "nearestLowerSurfaceDistanceMm", "automaticClassification", "supportPaintStrokeOrder", "supportPaintMode", "manuallyPainted", "manuallyOverridden"], `${label}.entries[${index}]`);
    const id = nonEmptyString(entry.id, `${label}.entries[${index}].id`);
    if (ids.has(id)) throw new Error(`${label}.entries contains duplicate ids`); ids.add(id);
    if (entry.source !== "diagnosed-face" && entry.source !== "explicit-profile") throw new Error(`${label}.entries[${index}].source is invalid`);
    nonNegativeInteger(entry.sourceIndex, `${label}.entries[${index}].sourceIndex`); nonNegativeInteger(entry.siteIndex, `${label}.entries[${index}].siteIndex`);
    if (entry.faceIndex !== undefined) nonNegativeInteger(entry.faceIndex, `${label}.entries[${index}].faceIndex`);
    if (entry.classification !== "inside" && entry.classification !== "outside" && entry.classification !== "unresolved") throw new Error(`${label}.entries[${index}].classification is invalid`);
    for (const key of ["positionMm", "normal"] as const) if (entry[key] !== undefined) {
      const point = objectRecord(entry[key], `${label}.entries[${index}].${key}`);
      onlyKeys(point, ["xMm", "yMm", "zMm"], `${label}.entries[${index}].${key}`);
      finiteNumber(point.xMm, `${label}.entries[${index}].${key}.xMm`); finiteNumber(point.yMm, `${label}.entries[${index}].${key}.yMm`); finiteNumber(point.zMm, `${label}.entries[${index}].${key}.zMm`);
    }
    if (entry.patchId !== undefined) nonNegativeInteger(entry.patchId, `${label}.entries[${index}].patchId`);
    for (const key of ["contactRadiusMm", "contactOverlapMm"] as const) if (entry[key] !== undefined && !(finiteNumber(entry[key], `${label}.entries[${index}].${key}`) >= 0)) throw new Error(`${label}.entries[${index}].${key} must be non-negative`);
    if (entry.duplicateOf !== undefined) nonEmptyString(entry.duplicateOf, `${label}.entries[${index}].duplicateOf`);
    if (entry.reason !== undefined) nonEmptyString(entry.reason, `${label}.entries[${index}].reason`);
    if (entry.rayResult !== undefined && entry.rayResult !== "plate-visible" && entry.rayResult !== "body-blocked" && entry.rayResult !== "ray-unresolved") throw new Error(`${label}.entries[${index}].rayResult is invalid`);
    if (entry.nearestLowerSurfaceDistanceMm !== undefined && entry.nearestLowerSurfaceDistanceMm !== null && !(finiteNumber(entry.nearestLowerSurfaceDistanceMm, `${label}.entries[${index}].nearestLowerSurfaceDistanceMm`) >= 0)) throw new Error(`${label}.entries[${index}].nearestLowerSurfaceDistanceMm is invalid`);
    if (entry.automaticClassification !== undefined && entry.automaticClassification !== "inside" && entry.automaticClassification !== "outside" && entry.automaticClassification !== "unresolved") throw new Error(`${label}.entries[${index}].automaticClassification is invalid`);
    if (entry.supportPaintStrokeOrder !== undefined) nonNegativeInteger(entry.supportPaintStrokeOrder, `${label}.entries[${index}].supportPaintStrokeOrder`);
    if (entry.supportPaintMode !== undefined && entry.supportPaintMode !== "inside" && entry.supportPaintMode !== "outside" && entry.supportPaintMode !== "auto") throw new Error(`${label}.entries[${index}].supportPaintMode is invalid`);
    for (const key of ["manuallyPainted", "manuallyOverridden"] as const) if (entry[key] !== undefined && typeof entry[key] !== "boolean") throw new Error(`${label}.entries[${index}].${key} must be boolean`);
    return entry;
  });
  const counts = objectRecord(root.counts, `${label}.counts`);
  onlyKeys(counts, ["total", "inside", "outside", "unresolved", "duplicate", "unassigned", "mixedFace", "insideSupportSite", "outsideSupportSite", "unresolvedSupportSite", "duplicateSupportSite"], `${label}.counts`);
  for (const key of ["total", "inside", "outside", "unresolved", "duplicate", "unassigned", "mixedFace", "insideSupportSite", "outsideSupportSite", "unresolvedSupportSite", "duplicateSupportSite"] as const) nonNegativeInteger(counts[key], `${label}.counts.${key}`);
  if (counts.total !== entries.length) throw new Error(`${label}.counts.total does not match entries`);
  if (root.baseFootprint === undefined || root.rayFacts === undefined || root.paintFacts === undefined) throw new Error(`${label} baseFootprint/rayFacts/paintFacts are required`);
  if (root.baseFootprint !== null) {
    const footprint = objectRecord(root.baseFootprint, `${label}.baseFootprint`);
    onlyKeys(footprint, ["schema", "source", "valid", "reason", "vertices", "sourceBallCount", "boundaryEpsilonMm", "boundsMm"], `${label}.baseFootprint`);
    if (footprint.schema !== "katachi.skin.base-footprint.v1" || footprint.source !== "support-free-host-field-outer-hull-v1" || typeof footprint.valid !== "boolean") throw new Error(`${label}.baseFootprint metadata is invalid`);
    if (footprint.reason !== null && typeof footprint.reason !== "string") throw new Error(`${label}.baseFootprint.reason is invalid`);
    nonNegativeInteger(footprint.sourceBallCount, `${label}.baseFootprint.sourceBallCount`); if (!(finiteNumber(footprint.boundaryEpsilonMm, `${label}.baseFootprint.boundaryEpsilonMm`) >= 0)) throw new Error(`${label}.baseFootprint.boundaryEpsilonMm is invalid`);
    if (!Array.isArray(footprint.vertices)) throw new Error(`${label}.baseFootprint.vertices must be an array`);
    for (let index = 0; index < footprint.vertices.length; index += 1) { const point = objectRecord(footprint.vertices[index], `${label}.baseFootprint.vertices[${index}]`); onlyKeys(point, ["xMm", "yMm"], `${label}.baseFootprint.vertices[${index}]`); finiteNumber(point.xMm, "base footprint xMm"); finiteNumber(point.yMm, "base footprint yMm"); }
    if (footprint.boundsMm !== null) { const bounds = objectRecord(footprint.boundsMm, `${label}.baseFootprint.boundsMm`); onlyKeys(bounds, ["minX", "minY", "maxX", "maxY"], `${label}.baseFootprint.boundsMm`); for (const key of ["minX", "minY", "maxX", "maxY"] as const) finiteNumber(bounds[key], `${label}.baseFootprint.boundsMm.${key}`); }
  }
  if (root.rayFacts !== null) {
    const facts = objectRecord(root.rayFacts, `${label}.rayFacts`); onlyKeys(facts, ["meshScaleMm", "lowerIntersectionEpsilonMm", "gridCellSizeMm", "gridCellCount", "surfaceTriangleCount", "invalidSurfaceTriangleCount", "method", "surfaceSource", "rayDirection"], `${label}.rayFacts`);
    for (const key of ["meshScaleMm", "lowerIntersectionEpsilonMm", "gridCellSizeMm"] as const) if (!(finiteNumber(facts[key], `${label}.rayFacts.${key}`) >= 0)) throw new Error(`${label}.rayFacts.${key} is invalid`);
    for (const key of ["gridCellCount", "surfaceTriangleCount", "invalidSurfaceTriangleCount"] as const) nonNegativeInteger(facts[key], `${label}.rayFacts.${key}`);
    if (facts.method !== "support-free-surface-downward-ray-v1" || facts.surfaceSource !== "support-free-final-surface" || facts.rayDirection !== "negative-z") throw new Error(`${label}.rayFacts metadata is invalid`);
  }
  if (root.paintFacts !== null) {
    const facts = objectRecord(root.paintFacts, `${label}.paintFacts`); onlyKeys(facts, ["strokeCount", "automaticCounts", "paintedSupportSiteCount", "manualOverrideSupportSiteCount", "autoResetSupportSiteCount", "finalCounts"], `${label}.paintFacts`);
    for (const key of ["strokeCount", "paintedSupportSiteCount", "manualOverrideSupportSiteCount", "autoResetSupportSiteCount"] as const) nonNegativeInteger(facts[key], `${label}.paintFacts.${key}`);
    for (const key of ["automaticCounts", "finalCounts"] as const) { const countsValue = objectRecord(facts[key], `${label}.paintFacts.${key}`); onlyKeys(countsValue, ["inside", "outside", "unresolved"], `${label}.paintFacts.${key}`); for (const countKey of ["inside", "outside", "unresolved"] as const) nonNegativeInteger(countsValue[countKey], `${label}.paintFacts.${key}.${countKey}`); }
  }
  const validateFloatTriangles = (value: unknown, key: string): Float32Array => {
    if (!(value instanceof Float32Array) || value.length % 9 !== 0) throw new Error(`${label}.${key} must be a Float32Array triangle buffer`);
    for (const item of value) if (!Number.isFinite(item)) throw new Error(`${label}.${key} contains non-finite values`);
    return value;
  };
  validateFloatTriangles(root.outsideFacePositionsMm, "outsideFacePositionsMm");
  validateFloatTriangles(root.diagnosedFacePositionsMm, "diagnosedFacePositionsMm");
  if (!Array.isArray(root.outsideExplicitTargetsMm) || !Array.isArray(root.insideTargets) || !Array.isArray(root.mixedFaceIndices)) throw new Error(`${label} derived collections are malformed`);
  const targetIds = new Set<string>();
  for (let index = 0; index < root.outsideExplicitTargetsMm.length; index += 1) {
    const target = objectRecord(root.outsideExplicitTargetsMm[index], `${label}.outsideExplicitTargetsMm[${index}]`);
    onlyKeys(target, ["xMm", "yMm", "zMm", "contactRadiusMm", "contactOverlapMm", "patchId"], `${label}.outsideExplicitTargetsMm[${index}]`);
    finiteNumber(target.xMm, "outside target xMm"); finiteNumber(target.yMm, "outside target yMm"); finiteNumber(target.zMm, "outside target zMm");
    for (const key of ["contactRadiusMm", "contactOverlapMm"] as const) if (target[key] !== undefined && !(finiteNumber(target[key], key) >= 0)) throw new Error(`${label}.${key} is invalid`);
    if (target.patchId !== undefined) nonNegativeInteger(target.patchId, `${label}.outsideExplicitTargetsMm[${index}].patchId`);
  }
  for (let index = 0; index < root.insideTargets.length; index += 1) {
    const target = objectRecord(root.insideTargets[index], `${label}.insideTargets[${index}]`);
    onlyKeys(target, ["assignmentId", "patchId", "position", "normal", "markerRadius", "reachedByInternal", "basis"], `${label}.insideTargets[${index}]`);
    const id = nonEmptyString(target.assignmentId, `${label}.insideTargets[${index}].assignmentId`); if (targetIds.has(id)) throw new Error(`${label}.insideTargets has duplicate assignmentId`); targetIds.add(id);
    if (target.patchId !== undefined) nonNegativeInteger(target.patchId, `${label}.insideTargets[${index}].patchId`);
    const position = objectRecord(target.position, `${label}.insideTargets[${index}].position`); onlyKeys(position, ["x", "y", "z"], `${label}.insideTargets[${index}].position`); finiteNumber(position.x, "target x"); finiteNumber(position.y, "target y"); finiteNumber(position.z, "target z");
    if (target.normal !== undefined) { const normal = objectRecord(target.normal, `${label}.insideTargets[${index}].normal`); onlyKeys(normal, ["x", "y", "z"], `${label}.insideTargets[${index}].normal`); finiteNumber(normal.x, "target normal x"); finiteNumber(normal.y, "target normal y"); finiteNumber(normal.z, "target normal z"); }
    if (!(finiteNumber(target.markerRadius, "target markerRadius") >= 0) || typeof target.reachedByInternal !== "boolean" || target.basis !== "finalMesh") throw new Error(`${label}.insideTargets[${index}] facts are invalid`);
  }
  const mixed = new Set<number>(); for (const value of root.mixedFaceIndices) { const index = nonNegativeInteger(value, `${label}.mixedFaceIndices`); if (mixed.has(index)) throw new Error(`${label}.mixedFaceIndices contains duplicates`); mixed.add(index); }
  const result = cloneValue({ ...root, entries, counts }) as unknown as OverhangSupportPolicyResult;
  const ledgerForCounts = {
    policy: result.policy,
    entries: result.entries,
    counts: { ...result.counts, mixedFace: mixed.size },
  } as OverhangSupportPolicyResult;
  let recomputedCounts: ReturnType<typeof validateOverhangAssignmentLedger>;
  try {
    recomputedCounts = validateOverhangAssignmentLedger(ledgerForCounts);
  } catch (error) {
    throw new Error(`${label} is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const key of ["total", "inside", "outside", "unresolved", "duplicate", "unassigned", "mixedFace", "insideSupportSite", "outsideSupportSite", "unresolvedSupportSite", "duplicateSupportSite"] as const) {
    const expected = key === "mixedFace" ? mixed.size : recomputedCounts[key];
    if (result.counts[key] !== expected) throw new Error(`${label}.counts.${key} does not match recomputed ledger facts`);
  }
  return result;
}

function validateTargetedGridContactFacts(value: unknown, label: string): void {
  const root = objectRecord(value, label);
  onlyKeys(root, ["usefulPatchCount", "componentCount", "mainComponentKey", "mainComponentSize", "patches"], label);
  for (const key of ["usefulPatchCount", "componentCount", "mainComponentSize"] as const) nonNegativeInteger(root[key], `${label}.${key}`);
  if (root.mainComponentKey !== null && root.mainComponentKey !== undefined) nonEmptyString(root.mainComponentKey, `${label}.mainComponentKey`);
  if (!Array.isArray(root.patches)) throw new Error(`${label}.patches must be an array`);
  const ids = new Set<number>();
  for (let index = 0; index < root.patches.length; index += 1) {
    const patch = objectRecord(root.patches[index], `${label}.patches[${index}]`);
    onlyKeys(patch, ["patchId", "contactNodeIds", "contactCount", "componentKey", "componentSize"], `${label}.patches[${index}]`);
    const id = nonNegativeInteger(patch.patchId, `${label}.patches[${index}].patchId`); if (ids.has(id)) throw new Error(`${label}.patches contains duplicate patch IDs`); ids.add(id);
    if (!Array.isArray(patch.contactNodeIds)) throw new Error(`${label}.patches[${index}].contactNodeIds must be an array`);
    const nodeIds = new Set<number>(); for (const nodeId of patch.contactNodeIds) { const idValue = nonNegativeInteger(nodeId, `${label}.patches[${index}].contactNodeIds`); if (nodeIds.has(idValue)) throw new Error(`${label}.patches[${index}].contactNodeIds contains duplicates`); nodeIds.add(idValue); }
    if (patch.contactCount !== patch.contactNodeIds.length) throw new Error(`${label}.patches[${index}].contactCount does not match IDs`);
    nonEmptyString(patch.componentKey, `${label}.patches[${index}].componentKey`); nonNegativeInteger(patch.componentSize, `${label}.patches[${index}].componentSize`);
  }
}

interface TargetedGridComponentSummary {
  componentCount: number;
  maxComponentSize: number;
  mainComponentKey: string | null;
  mainComponentSize: number;
}

/**
 * Reconstruct the component facts used by targetedGrid.ts before it adds
 * target-connection edges.  `connectedTargets` is not the number of
 * connected fact records when there is more than one patch component: the
 * generator clamps that count to the largest patch component.  The persisted
 * contact ledger contains the exact stable component keys/sizes needed to
 * reproduce that rule without treating a duplicated count as authority.
 */
function deriveTargetedGridComponentSummary(value: unknown, label: string): TargetedGridComponentSummary {
  validateTargetedGridContactFacts(value, label);
  const root = objectRecord(value, label);
  const patches = root.patches as unknown[];
  if (root.usefulPatchCount !== patches.length) throw new Error(`${label}.usefulPatchCount does not match patches`);
  const idsByComponent = new Map<string, number[]>();
  for (let index = 0; index < patches.length; index += 1) {
    const patch = objectRecord(patches[index], `${label}.patches[${index}]`);
    const componentKey = patch.componentKey as string;
    const patchId = patch.patchId as number;
    const ids = idsByComponent.get(componentKey);
    if (ids) ids.push(patchId);
    else idsByComponent.set(componentKey, [patchId]);
  }
  const components = [...idsByComponent.entries()].map(([key, patchIds]) => {
    const sortedIds = patchIds.slice().sort((a, b) => a - b);
    if (key !== sortedIds.join(",")) throw new Error(`${label}.patches componentKey is not the canonical patch set`);
    const expectedSize = sortedIds.length;
    for (const patch of patches) {
      const item = objectRecord(patch, label);
      if (item.componentKey === key && item.componentSize !== expectedSize) {
        throw new Error(`${label}.patches componentSize does not match component membership`);
      }
    }
    return { key, patchIds: sortedIds, size: expectedSize };
  });
  if (root.componentCount !== components.length) throw new Error(`${label}.componentCount does not match component membership`);
  const ordered = components.slice().sort((a, b) => b.size - a.size || a.patchIds[0] - b.patchIds[0] || a.key.localeCompare(b.key));
  const main = ordered[0] ?? null;
  if (root.mainComponentKey !== (main?.key ?? null) || root.mainComponentSize !== (main?.size ?? 0)) {
    throw new Error(`${label}.mainComponent facts do not match component membership`);
  }
  return {
    componentCount: components.length,
    maxComponentSize: main?.size ?? 0,
    mainComponentKey: main?.key ?? null,
    mainComponentSize: main?.size ?? 0,
  };
}

/** Ensure the persisted patch-component labels are compatible with the
 * actual restored graph topology.  Targeted-grid contact facts describe the
 * patch-link components before target edges are appended, so contact-node and
 * unambiguous material-node topology are used to bind a label; graph
 * component cardinality is intentionally not confused with patch cardinality. */
function validateTargetedGridComponentTopology(
  graph: InternalStructureGraph,
  facts: unknown,
  targetConnectionFacts: readonly TargetedGridTargetConnectionFact[],
  targets: readonly unknown[],
  targetEdgeIds: ReadonlySet<number>,
  label: string,
): void {
  deriveTargetedGridComponentSummary(facts, label);
  const graphFacts = objectRecord(facts, label);
  const contactKeysByNode = new Map<number, Set<string>>();
  for (let index = 0; index < (graphFacts.patches as unknown[]).length; index += 1) {
    const patch = objectRecord((graphFacts.patches as unknown[])[index], `${label}.patches[${index}]`);
    const componentKey = patch.componentKey as string;
    for (const rawNodeId of patch.contactNodeIds as unknown[]) {
      const nodeId = rawNodeId as number;
      const keys = contactKeysByNode.get(nodeId) ?? new Set<string>();
      keys.add(componentKey);
      if (keys.size > 1) throw new Error(`${label} contact node belongs to multiple patch components`);
      contactKeysByNode.set(nodeId, keys);
    }
  }
  const parent = new Map<number, number>();
  for (const node of graph.nodes) parent.set(node.id, node.id);
  const find = (id: number): number => {
    let root = parent.get(id);
    if (root === undefined) throw new Error(`${label} references an unknown graph node`);
    while (parent.get(root) !== root) root = parent.get(root)!;
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const join = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };
  // Runtime order is patch-to-patch links first, then target connections.
  // Exclude a validated target edge unless its endpoints are also a known
  // same-component patch-contact pair; this preserves addEdge() reuse of an
  // existing patch edge while preventing a target-only bridge from forging a
  // single patch component.
  for (const edge of graph.edges) {
    if (targetEdgeIds.has(edge.id)) {
      const startKeys = contactKeysByNode.get(edge.start);
      const endKeys = contactKeysByNode.get(edge.end);
      const reusedPatchEdge = startKeys !== undefined && endKeys !== undefined
        && [...startKeys].some((key) => endKeys.has(key));
      if (!reusedPatchEdge) continue;
    }
    join(edge.start, edge.end);
  }

  const rootToComponentKey = new Map<number, string>();
  const componentKeyToRoot = new Map<string, number>();
  const contactRootsByPatchId = new Map<number, Set<number>>();
  const patchKeyById = new Map<number, string>();
  for (let index = 0; index < (graphFacts.patches as unknown[]).length; index += 1) {
    const patch = objectRecord((graphFacts.patches as unknown[])[index], `${label}.patches[${index}]`);
    const componentKey = patch.componentKey as string;
    patchKeyById.set(patch.patchId as number, componentKey);
    const contactNodeIds = patch.contactNodeIds as unknown[];
    if (contactNodeIds.length === 0) continue;
    const topologyRoots = new Set(contactNodeIds.map((nodeId) => find(nodeId as number)));
    if (topologyRoots.size !== 1) throw new Error(`${label}.patches[${index}] contact nodes span graph components`);
    contactRootsByPatchId.set(patch.patchId as number, topologyRoots);
    const topologyRoot = [...topologyRoots][0];
    const existingKey = rootToComponentKey.get(topologyRoot);
    if (existingKey !== undefined && existingKey !== componentKey) {
      throw new Error(`${label} graph topology merges distinct patch components`);
    }
    const existingRoot = componentKeyToRoot.get(componentKey);
    if (existingRoot !== undefined && existingRoot !== topologyRoot) {
      throw new Error(`${label} patch component spans graph components`);
    }
    rootToComponentKey.set(topologyRoot, componentKey);
    componentKeyToRoot.set(componentKey, topologyRoot);
  }

  // A runtime component with no patch-to-patch contact nodes is still
  // representable when its target evidence has one material-node component.
  // Material nodes are existing patch points; synthetic target contact nodes
  // are deliberately ignored because their target-only edge was removed from
  // the DSU. Multiple independent targets on one patch remain unbound when
  // their material nodes are separate, as the generator does not use target
  // edges as patch-component edges.
  const targetRootsByPatchId = new Map<number, Set<number>>();
  for (const fact of targetConnectionFacts) {
    if (fact.status !== "connected") continue;
    const target = objectRecord(targets[fact.sourceTargetIndex], `${label}.target[${fact.sourceTargetIndex}]`);
    if (target.patchId === undefined) continue;
    const roots = targetRootsByPatchId.get(target.patchId as number) ?? new Set<number>();
    roots.add(find(fact.materialNodeId!));
    targetRootsByPatchId.set(target.patchId as number, roots);
  }
  for (const [patchId, topologyRoots] of targetRootsByPatchId) {
    if (contactRootsByPatchId.has(patchId) || topologyRoots.size !== 1) continue;
    const topologyRoot = [...topologyRoots][0];
    const componentKey = patchKeyById.get(patchId);
    if (componentKey === undefined) throw new Error(`${label} target evidence references an unknown patch`);
    const existingKey = rootToComponentKey.get(topologyRoot);
    if (existingKey !== undefined && existingKey !== componentKey) {
      throw new Error(`${label} graph topology merges distinct patch components`);
    }
    const existingRoot = componentKeyToRoot.get(componentKey);
    if (existingRoot !== undefined && existingRoot !== topologyRoot) {
      throw new Error(`${label} patch component spans graph components`);
    }
    rootToComponentKey.set(topologyRoot, componentKey);
    componentKeyToRoot.set(componentKey, topologyRoot);
  }
}

function validateContactFloorFacts(value: unknown, label: string): void {
  const root = objectRecord(value, label); onlyKeys(root, ["requiredContacts", "mainComponentKey", "patches"], label);
  nonNegativeInteger(root.requiredContacts, `${label}.requiredContacts`);
  if (root.mainComponentKey !== null) nonEmptyString(root.mainComponentKey, `${label}.mainComponentKey`);
  if (!Array.isArray(root.patches)) throw new Error(`${label}.patches must be an array`);
  const ids = new Set<number>();
  for (let index = 0; index < root.patches.length; index += 1) {
    const patch = objectRecord(root.patches[index], `${label}.patches[${index}]`); onlyKeys(patch, ["patchId", "selectedDistinctContactCount", "candidateLinkCount", "candidateDistinctContactCount", "componentKey"], `${label}.patches[${index}]`);
    const id = nonNegativeInteger(patch.patchId, `${label}.patches[${index}].patchId`); if (ids.has(id)) throw new Error(`${label}.patches contains duplicate patch IDs`); ids.add(id);
    for (const key of ["selectedDistinctContactCount", "candidateLinkCount", "candidateDistinctContactCount"] as const) nonNegativeInteger(patch[key], `${label}.patches[${index}].${key}`);
    nonEmptyString(patch.componentKey, `${label}.patches[${index}].componentKey`);
  }
}

function validateTargetConnectionFacts(value: unknown, label: string): TargetedGridTargetConnectionFact[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const sourceIds = new Set<number>();
  for (let index = 0; index < value.length; index += 1) {
    const fact = objectRecord(value[index], `${label}[${index}]`); onlyKeys(fact, ["sourceTargetIndex", "contactNodeId", "materialNodeId", "edgeId", "status"], `${label}[${index}]`);
    const source = nonNegativeInteger(fact.sourceTargetIndex, `${label}[${index}].sourceTargetIndex`); if (sourceIds.has(source)) throw new Error(`${label} contains duplicate sourceTargetIndex`); sourceIds.add(source);
    for (const key of ["contactNodeId", "materialNodeId", "edgeId"] as const) if (fact[key] !== null) nonNegativeInteger(fact[key], `${label}[${index}].${key}`);
    if (fact.status !== "connected" && fact.status !== "unresolved") throw new Error(`${label}[${index}].status is invalid`);
  }
  return value as unknown as TargetedGridTargetConnectionFact[];
}

/** Validate the generator's target-connection provenance against the restored
 * graph, rather than trusting its status or numeric summary. */
function validateTargetConnectionEvidence(
  facts: readonly TargetedGridTargetConnectionFact[],
  targetCount: number,
  graph: InternalStructureGraph,
  label: string,
): Set<number> {
  if (facts.length !== targetCount) throw new Error(`${label} must cover every target exactly once`);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const targetEdgeIds = new Set<number>();
  for (let index = 0; index < facts.length; index += 1) {
    const fact = facts[index];
    if (fact.sourceTargetIndex < 0 || fact.sourceTargetIndex >= targetCount) throw new Error(`${label}[${index}] sourceTargetIndex is out of range`);
    if (fact.status === "unresolved") {
      if (fact.contactNodeId !== null || fact.materialNodeId !== null || fact.edgeId !== null) {
        throw new Error(`${label}[${index}] unresolved fact must have null graph references`);
      }
      continue;
    }
    if (fact.contactNodeId === null || fact.materialNodeId === null || fact.edgeId === null) {
      throw new Error(`${label}[${index}] connected fact must have all graph references`);
    }
    if (!nodeIds.has(fact.contactNodeId) || !nodeIds.has(fact.materialNodeId)) {
      throw new Error(`${label}[${index}] connected fact has a dangling node reference`);
    }
    const edge = edges.get(fact.edgeId);
    if (!edge || !((edge.start === fact.contactNodeId && edge.end === fact.materialNodeId)
      || (edge.start === fact.materialNodeId && edge.end === fact.contactNodeId))) {
      throw new Error(`${label}[${index}] edge does not connect its claimed nodes`);
    }
    targetEdgeIds.add(fact.edgeId);
  }
  return targetEdgeIds;
}

function validateRoutingFacts(value: unknown, label: string): DryWebRoutingFacts {
  const root = objectRecord(value, label); onlyKeys(root, ["automaticDryWebCount", "blueAddedCount", "orangeExcludedCount", "finalDryWebCount"], label);
  for (const key of ["automaticDryWebCount", "blueAddedCount", "orangeExcludedCount", "finalDryWebCount"] as const) nonNegativeInteger(root[key], `${label}.${key}`);
  return root as unknown as DryWebRoutingFacts;
}

function validateDryWebTargetsAgainstLedger(
  targets: readonly OverhangDryWebTarget[],
  facts: DryWebRoutingFacts | null,
  ledger: OverhangSupportPolicyResult,
  label: string,
): void {
  const expectedIds = new Set<string>();
  let automaticDryWebCount = 0;
  let blueAddedCount = 0;
  let orangeExcludedCount = 0;
  for (const entry of ledger.entries) {
    if (entry.duplicateOf || !entry.positionMm || entry.classification === "unresolved") continue;
    const automatic = entry.automaticClassification ?? entry.classification;
    const automaticDryWeb = automatic === "inside";
    const finalDryWeb = entry.classification === "inside";
    if (automaticDryWeb) automaticDryWebCount += 1;
    if (!automaticDryWeb && finalDryWeb && entry.supportPaintMode === "inside") blueAddedCount += 1;
    if (automaticDryWeb && !finalDryWeb && entry.supportPaintMode === "outside") orangeExcludedCount += 1;
    if (finalDryWeb) expectedIds.add(entry.id);
  }
  const actualIds = new Set(targets.map((target) => target.assignmentId));
  if (actualIds.size !== targets.length || actualIds.size !== expectedIds.size
    || [...actualIds].some((id) => !expectedIds.has(id))) {
    throw new Error(`${label} does not match effective support ledger assignments`);
  }
  if (facts !== null) {
    const expected = {
      automaticDryWebCount,
      blueAddedCount,
      orangeExcludedCount,
      finalDryWebCount: expectedIds.size,
    };
    for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
      if (facts[key] !== expected[key]) throw new Error(`${label} routing facts do not match effective support ledger`);
    }
  }
}

function validateArtworkCurrentness(graph: ArtworkGraph, patchSetRevision: number, label: string): void {
  if (graph.state !== "surfaceDraft") throw new Error(`${label}.state must be surfaceDraft for the current Artwork boundary`);
  if (graph.surfaceDraft.patchSetRevision !== patchSetRevision) throw new Error(`${label}.surfaceDraft.patchSetRevision does not match Shape binding`);
}

function validateCanonicalAdoption(value: unknown, label: string): FkeiDryWebCanonicalAdoption {
  const root = objectRecord(value, label);
  onlyKeys(root, ["surfaceFingerprint", "resolution", "paintRevision", "artworkGraphSourceKey", "mode", "supportSettingsKey", "targetConnectionFacts", "exactValidated"], label);
  const supportSettingsKey = nonEmptyString(root.supportSettingsKey, `${label}.supportSettingsKey`);
  let parsedSettings: unknown;
  try { parsedSettings = JSON.parse(supportSettingsKey); } catch { throw new Error(`${label}.supportSettingsKey must be canonical JSON`); }
  const settings = objectRecord(parsedSettings, `${label}.supportSettingsKey`);
  const settingsKeys = ["supportMode", "objectLiftMm", "tipRadiusMm", "trunkMinimumRadiusMm", "loadWidening", "maximumUnsupportedLengthMm", "branchAngleDeg", "baseVolumeVerticalSupports", "dryWebMinimumDiameterMm", "dryWebMaximumUnreinforcedLengthMm"] as const;
  onlyKeys(settings, settingsKeys, `${label}.supportSettingsKey`);
  if (settings.supportMode !== "branching" && settings.supportMode !== "vertical") throw new Error(`${label}.supportSettingsKey.supportMode is invalid`);
  if (typeof settings.baseVolumeVerticalSupports !== "boolean") throw new Error(`${label}.supportSettingsKey.baseVolumeVerticalSupports is invalid`);
  const bounded = (key: string, minimum: number, maximum: number): number => {
    const number = finiteNumber(settings[key], `${label}.supportSettingsKey.${key}`);
    if (number < minimum || number > maximum) throw new Error(`${label}.supportSettingsKey.${key} is outside runtime control range`);
    return number;
  };
  bounded("objectLiftMm", 0, 3);
  const tipRadiusMm = bounded("tipRadiusMm", 0.2, 0.8);
  const trunkMinimumRadiusMm = bounded("trunkMinimumRadiusMm", 0.4, 2);
  if (trunkMinimumRadiusMm < tipRadiusMm) throw new Error(`${label}.supportSettingsKey.trunkMinimumRadiusMm must not be below tipRadiusMm`);
  bounded("loadWidening", 0, 0.2);
  bounded("maximumUnsupportedLengthMm", 4, 30);
  bounded("branchAngleDeg", 25, 45);
  bounded("dryWebMinimumDiameterMm", 0.8, 4);
  bounded("dryWebMaximumUnreinforcedLengthMm", 4, 30);
  const canonicalSettings = JSON.stringify({
    supportMode: settings.supportMode,
    objectLiftMm: settings.objectLiftMm,
    tipRadiusMm: settings.tipRadiusMm,
    trunkMinimumRadiusMm: settings.trunkMinimumRadiusMm,
    loadWidening: settings.loadWidening,
    maximumUnsupportedLengthMm: settings.maximumUnsupportedLengthMm,
    branchAngleDeg: settings.branchAngleDeg,
    baseVolumeVerticalSupports: settings.baseVolumeVerticalSupports,
    dryWebMinimumDiameterMm: settings.dryWebMinimumDiameterMm,
    dryWebMaximumUnreinforcedLengthMm: settings.dryWebMaximumUnreinforcedLengthMm,
  });
  if (canonicalSettings !== supportSettingsKey) throw new Error(`${label}.supportSettingsKey must preserve canonical JSON ordering`);
  return {
    surfaceFingerprint: nonEmptyString(root.surfaceFingerprint, `${label}.surfaceFingerprint`),
    resolution: nonNegativeInteger(root.resolution, `${label}.resolution`),
    paintRevision: nonNegativeInteger(root.paintRevision, `${label}.paintRevision`),
    artworkGraphSourceKey: nonEmptyString(root.artworkGraphSourceKey, `${label}.artworkGraphSourceKey`),
    mode: root.mode === "plate" || root.mode === "window" ? root.mode : (() => { throw new Error(`${label}.mode is invalid`); })(),
    supportSettingsKey,
    targetConnectionFacts: validateTargetConnectionFacts(cloneValue(root.targetConnectionFacts), `${label}.targetConnectionFacts`),
    exactValidated: typeof root.exactValidated === "boolean" ? root.exactValidated : (() => { throw new Error(`${label}.exactValidated is invalid`); })(),
  };
}

function sameCodecValue(a: unknown, b: unknown): boolean {
  try { return JSON.stringify(encodeFkeiValue(a)) === JSON.stringify(encodeFkeiValue(b)); } catch { return false; }
}

function validateInternalGraph(value: unknown, label: string): InternalStructureGraph {
  const root = objectRecord(value, label);
  onlyKeys(root, ["kind", "nodes", "edges", "stats"], label);
  if (root.kind !== "voronoiEdge" && root.kind !== "targetedGrid") throw new Error(`${label}.kind is invalid`);
  if (!Array.isArray(root.nodes) || !Array.isArray(root.edges) || !root.stats || typeof root.stats !== "object") throw new Error(`${label} is malformed`);
  const nodeIds = new Set<number>();
  for (const node of root.nodes) {
    const item = objectRecord(node, `${label}.node`);
    onlyKeys(item, ["id", "position", "radius"], `${label}.node`);
    const id = nonNegativeInteger(item.id, `${label}.node.id`); if (nodeIds.has(id)) throw new Error(`${label} contains duplicate node IDs`); nodeIds.add(id);
    const position = objectRecord(item.position, `${label}.node.position`);
    onlyKeys(position, ["x", "y", "z"], `${label}.node.position`);
    finiteNumber(position.x, `${label}.node.position.x`); finiteNumber(position.y, `${label}.node.position.y`); finiteNumber(position.z, `${label}.node.position.z`);
    if (!(finiteNumber(item.radius, `${label}.node.radius`) >= 0)) throw new Error(`${label}.node.radius must be non-negative`);
  }
  const edgeIds = new Set<number>();
  for (const edge of root.edges) {
    const item = objectRecord(edge, `${label}.edge`);
    onlyKeys(item, ["id", "start", "end", "radius"], `${label}.edge`);
    const id = nonNegativeInteger(item.id, `${label}.edge.id`); if (edgeIds.has(id)) throw new Error(`${label} contains duplicate edge IDs`); edgeIds.add(id);
    const start = nonNegativeInteger(item.start, `${label}.edge.start`); const end = nonNegativeInteger(item.end, `${label}.edge.end`);
    if (start === end || !nodeIds.has(start) || !nodeIds.has(end)) throw new Error(`${label}.edge endpoint is dangling or self-referential`);
    if (!(finiteNumber(item.radius, `${label}.edge.radius`) >= 0)) throw new Error(`${label}.edge.radius must be non-negative`);
  }
  const stats = objectRecord(root.stats, `${label}.stats`);
  const statKeys = ["inputPoints", "delaunayTetrahedra", "candidateEdges", "clippedEdges", "removedShortEdges", "removedOutsideEdges", "removedIsolatedEdges", "requestedTargets", "connectedTargets", "gridNodeCount", "gridEdgeCount", "dryWebContactFacts"];
  onlyKeys(stats, statKeys, `${label}.stats`);
  for (const key of statKeys.slice(0, 11)) if (stats[key] !== undefined) nonNegativeInteger(stats[key], `${label}.stats.${key}`);
  if (root.kind === "targetedGrid") {
    for (const key of ["requestedTargets", "connectedTargets", "gridNodeCount", "gridEdgeCount"] as const) {
      if (stats[key] === undefined) throw new Error(`${label}.stats.${key} is required for targetedGrid`);
    }
    if (stats.dryWebContactFacts === undefined) throw new Error(`${label}.stats.dryWebContactFacts is required for targetedGrid connectedTargets derivation`);
    if (stats.gridNodeCount === undefined || stats.gridEdgeCount === undefined) throw new Error(`${label}.stats targetedGrid counts are required`);
    if (stats.gridNodeCount !== root.nodes.length || stats.gridEdgeCount !== root.edges.length) throw new Error(`${label}.stats grid counts do not match graph collections`);
  } else {
    if (stats.gridNodeCount !== undefined && stats.gridNodeCount !== root.nodes.length) throw new Error(`${label}.stats.gridNodeCount does not match graph nodes`);
    if (stats.gridEdgeCount !== undefined && stats.gridEdgeCount !== root.edges.length) throw new Error(`${label}.stats.gridEdgeCount does not match graph edges`);
  }
  if (stats.dryWebContactFacts !== undefined) validateTargetedGridContactFacts(stats.dryWebContactFacts, `${label}.stats.dryWebContactFacts`);
  return cloneValue(value) as InternalStructureGraph;
}

function validateDocument(value: unknown): FkeiDocument {
  const root = objectRecord(value, "FKEI document");
  const allowed = new Set(["schema", "printApproval", "savedAt", "compatibility", "bindings", "completedStage", "shape", "supportPaint", "artworkGraph", "surface", "dryWeb", "canonicalDryWeb", "riskDrivenLattice", "printProfile"]);
  for (const key of Object.keys(root)) if (!allowed.has(key)) throw new Error(`Unknown FKEI document field: ${key}`);
  if (root.schema !== FKEI_SCHEMA) throw new Error(`Unsupported FKEI schema: ${String(root.schema)}`);
  if (root.printApproval !== false) throw new Error("FKEI printApproval must remain false");
  const savedAt = nonEmptyString(root.savedAt, "savedAt");
  if (!Number.isFinite(Date.parse(savedAt))) throw new Error("savedAt must be an ISO date");
  const compatibility = objectRecord(root.compatibility, "compatibility");
  onlyKeys(compatibility, ["formatVersion", "studyId", "typedEncoding", "bindingModel", "appVersion", "generatorCommit"], "compatibility");
  if (compatibility.formatVersion !== 1 || compatibility.studyId !== "skin" || compatibility.typedEncoding !== FKEI_TYPED_ENCODING || compatibility.bindingModel !== FKEI_BINDING_MODEL) throw new Error("FKEI compatibility metadata is invalid");
  if (compatibility.appVersion !== undefined) nonEmptyString(compatibility.appVersion, "compatibility.appVersion");
  if (compatibility.generatorCommit !== undefined) nonEmptyString(compatibility.generatorCommit, "compatibility.generatorCommit");
  const bindings = validateBinding(root.bindings, "bindings");
  const completedStage = root.completedStage === undefined ? undefined : nonNegativeInteger(root.completedStage, "completedStage") as FkeiCompletedStage;
  if (completedStage !== undefined && (completedStage < 1 || completedStage > 7)) throw new Error("completedStage is invalid");
  const shape = validateShape(root.shape);
  const supportPaint = root.supportPaint === undefined ? undefined : validateSupportPaintArtifact(root.supportPaint);
  let artworkGraph: FkeiDocument["artworkGraph"];
  if (root.artworkGraph !== undefined) {
    const item = objectRecord(root.artworkGraph, "artworkGraph");
    onlyKeys(item, ["snapshot", "sourceKey"], "artworkGraph");
    const graph = cloneValue(item.snapshot) as ArtworkGraph;
    const graphResult = validateArtworkGraph(graph);
    if (!graphResult.ok) throw new Error(`artworkGraph is invalid: ${graphResult.errors.join("; ")}`);
    validateArtworkCurrentness(graph, bindings.patchSetRevision, "artworkGraph.snapshot");
    artworkGraph = { snapshot: graph, sourceKey: nonEmptyString(item.sourceKey, "artworkGraph.sourceKey") };
  }
  let surface: FkeiSurfaceArtifact | undefined;
  if (root.surface !== undefined) {
    const item = objectRecord(root.surface, "surface");
    onlyKeys(item, ["diagnosis", "automaticSupportResult", "effectiveSupportResult", "binding"], "surface");
    surface = {
      diagnosis: validateSurfaceDiagnosis(item.diagnosis, "surface.diagnosis"),
      automaticSupportResult: validateSupportResult(item.automaticSupportResult, "surface.automaticSupportResult"),
      effectiveSupportResult: validateSupportResult(item.effectiveSupportResult, "surface.effectiveSupportResult"),
      binding: validateBinding({ shapeFingerprint: bindings.shapeFingerprint, patchSetRevision: bindings.patchSetRevision, paintRevision: bindings.paintRevision, surface: item.binding }, "surface.binding").surface!,
    };
  }
  let dryWeb: FkeiDryWebArtifact | undefined;
  if (root.dryWeb !== undefined) {
    const item = objectRecord(root.dryWeb, "dryWeb");
    onlyKeys(item, ["preview", "targetSource", "exactDiagnosis", "exactBinding"], "dryWeb");
    const hasExactDiagnosis = item.exactDiagnosis !== undefined;
    const hasExactBinding = item.exactBinding !== undefined;
    if (hasExactDiagnosis !== hasExactBinding) throw new Error("dryWeb.exactDiagnosis and dryWeb.exactBinding must be provided together");
    const preview = objectRecord(item.preview, "dryWeb.preview");
    onlyKeys(preview, ["surfaceFingerprint", "resolution", "paintRevision", "artworkGraphSnapshot", "artworkGraphSourceKey", "graph", "targetConnectionFacts", "contactFloorFacts", "facts", "canonicalAdoption", "computeMs"], "dryWeb.preview");
    const previewGraph = cloneValue(preview.artworkGraphSnapshot) as ArtworkGraph;
    const graphResult = validateArtworkGraph(previewGraph);
    if (!graphResult.ok) throw new Error(`dryWeb.preview.artworkGraphSnapshot is invalid: ${graphResult.errors.join("; ")}`);
    validateArtworkCurrentness(previewGraph, bindings.patchSetRevision, "dryWeb.preview.artworkGraphSnapshot");
    const targetConnectionFacts = preview.targetConnectionFacts === null ? null : validateTargetConnectionFacts(cloneValue(preview.targetConnectionFacts), "dryWeb.preview.targetConnectionFacts");
    const contactFloorFacts = preview.contactFloorFacts === null ? null : cloneValue(preview.contactFloorFacts);
    // Shape, ranges and graph references were checked by the helper above.
    if (contactFloorFacts !== null) validateContactFloorFacts(contactFloorFacts, "dryWeb.preview.contactFloorFacts");
    const previewGraphValidated = validateInternalGraph(preview.graph, "dryWeb.preview.graph");
    const sourceTarget = objectRecord(item.targetSource, "dryWeb.targetSource");
    onlyKeys(sourceTarget, ["surfaceFingerprint", "resolution", "targets"], "dryWeb.targetSource");
    if (!Array.isArray(sourceTarget.targets)) throw new Error("dryWeb.targetSource.targets must be an array");
    const sourceTargetIds = new Set<string>();
    for (let index = 0; index < sourceTarget.targets.length; index += 1) {
      const target = objectRecord(sourceTarget.targets[index], `dryWeb.targetSource.targets[${index}]`);
      onlyKeys(target, ["assignmentId", "patchId", "position", "normal", "markerRadius", "reachedByInternal", "basis"], `dryWeb.targetSource.targets[${index}]`);
      const id = nonEmptyString(target.assignmentId, `dryWeb.targetSource.targets[${index}].assignmentId`); if (sourceTargetIds.has(id)) throw new Error("dryWeb.targetSource has duplicate assignmentId"); sourceTargetIds.add(id);
      if (target.patchId !== undefined) nonNegativeInteger(target.patchId, "dryWeb target patchId");
      const position = objectRecord(target.position, "dryWeb target position"); onlyKeys(position, ["x", "y", "z"], "dryWeb target position"); finiteNumber(position.x, "dryWeb target x"); finiteNumber(position.y, "dryWeb target y"); finiteNumber(position.z, "dryWeb target z");
      if (target.normal !== undefined) { const normal = objectRecord(target.normal, "dryWeb target normal"); onlyKeys(normal, ["x", "y", "z"], "dryWeb target normal"); finiteNumber(normal.x, "dryWeb target normal x"); finiteNumber(normal.y, "dryWeb target normal y"); finiteNumber(normal.z, "dryWeb target normal z"); }
      if (!(finiteNumber(target.markerRadius, "dryWeb target markerRadius") >= 0) || typeof target.reachedByInternal !== "boolean" || target.basis !== "finalMesh") throw new Error("dryWeb target facts are invalid");
    }
    let targetEdgeIds = new Set<number>();
    if (targetConnectionFacts !== null) {
      targetEdgeIds = validateTargetConnectionEvidence(targetConnectionFacts, sourceTarget.targets.length, previewGraphValidated, "dryWeb.preview.targetConnectionFacts");
    }
    let targetedComponentSummary: TargetedGridComponentSummary | undefined;
    let targetedGraphConnectedTargets: number | undefined;
    let targetedContactFacts: unknown;
    if (previewGraphValidated.kind === "targetedGrid") {
      const graphStats = previewGraphValidated.stats;
      if (graphStats.requestedTargets !== sourceTarget.targets.length) throw new Error("dryWeb graph requestedTargets do not match target source");
      targetedGraphConnectedTargets = graphStats.connectedTargets;
      const contactFacts = (graphStats as unknown as { dryWebContactFacts?: unknown }).dryWebContactFacts;
      if (contactFacts === undefined) throw new Error("dryWeb targetedGrid contact facts are required for connectedTargets derivation");
      targetedContactFacts = contactFacts;
      targetedComponentSummary = deriveTargetedGridComponentSummary(contactFacts, "dryWeb.preview.graph.stats.dryWebContactFacts");
      if (targetConnectionFacts !== null) {
        if (targetConnectionFacts.length !== sourceTarget.targets.length) throw new Error("dryWeb target connection facts do not cover target source");
      }
    }
    const facts = preview.facts === null ? null : validateRoutingFacts(preview.facts, "dryWeb.preview.facts");
    const canonicalAdoption = preview.canonicalAdoption === undefined
      ? undefined
      : validateCanonicalAdoption(preview.canonicalAdoption, "dryWeb.preview.canonicalAdoption");
    if (canonicalAdoption !== undefined) {
      targetEdgeIds = validateTargetConnectionEvidence(canonicalAdoption.targetConnectionFacts, sourceTarget.targets.length, previewGraphValidated, "dryWeb.preview.canonicalAdoption.targetConnectionFacts");
    }
    if (facts === null) {
      if (!canonicalAdoption || previewGraphValidated.kind !== "targetedGrid" || targetConnectionFacts !== null || contactFloorFacts !== null) {
        throw new Error("dryWeb.preview.facts may be null only for a targetedGrid canonical adoption");
      }
    } else if (canonicalAdoption !== undefined) {
      throw new Error("dryWeb.preview.canonicalAdoption requires null routing facts");
    }
    if (targetedContactFacts !== undefined && targetedComponentSummary !== undefined) {
      const topologyFacts = targetConnectionFacts ?? canonicalAdoption?.targetConnectionFacts;
      if (!topologyFacts) throw new Error("dryWeb targetedGrid component topology requires target connection evidence");
      validateTargetedGridComponentTopology(previewGraphValidated, targetedContactFacts, topologyFacts, sourceTarget.targets, targetEdgeIds, "dryWeb.preview.graph.stats.dryWebContactFacts");
    }
    if (targetedComponentSummary !== undefined) {
      const connectedFactCount = targetConnectionFacts === null
        ? (() => {
          if (!canonicalAdoption) throw new Error("dryWeb targetedGrid null target facts require canonical adoption");
          return canonicalAdoption.targetConnectionFacts.filter((fact) => fact.status === "connected").length;
        })()
        : targetConnectionFacts.filter((fact) => fact.status === "connected").length;
      const expectedConnectedTargets = targetedComponentSummary.componentCount === 1
        ? connectedFactCount
        : Math.min(connectedFactCount, targetedComponentSummary.maxComponentSize);
      if (targetedGraphConnectedTargets !== expectedConnectedTargets) throw new Error("dryWeb graph connectedTargets do not match targetedGrid component derivation");
    }
    if (canonicalAdoption) {
      if (canonicalAdoption.surfaceFingerprint !== preview.surfaceFingerprint
        || canonicalAdoption.resolution !== preview.resolution
        || canonicalAdoption.paintRevision !== preview.paintRevision
        || canonicalAdoption.artworkGraphSourceKey !== preview.artworkGraphSourceKey) {
        throw new Error("dryWeb canonical adoption facts do not match preview binding");
      }
      if (canonicalAdoption.exactValidated !== hasExactDiagnosis) throw new Error("dryWeb canonical adoption exactValidated does not match exact diagnosis");
    }
    const exactDiagnosis = hasExactDiagnosis ? validateSurfaceDiagnosis(item.exactDiagnosis, "dryWeb.exactDiagnosis") : undefined;
    const exactBinding = hasExactBinding
      ? validateBinding({ shapeFingerprint: bindings.shapeFingerprint, patchSetRevision: bindings.patchSetRevision, paintRevision: bindings.paintRevision, surface: item.exactBinding }, "dryWeb.exactBinding").surface!
      : undefined;
    if (exactDiagnosis && exactBinding) {
      if (exactDiagnosis.resolution !== exactBinding.resolution || exactDiagnosis.metrics.thresholdDeg !== exactBinding.angleThresholdDeg) {
        throw new Error("dryWeb exact diagnosis facts do not match exact binding");
      }
      if (exactDiagnosis.internalEdgeCount !== previewGraphValidated.edges.length) throw new Error("dryWeb exact diagnosis edge count does not match preview graph");
      if (surface && (exactDiagnosis.generation !== surface.diagnosis.generation
        || exactDiagnosis.baseFaceCount !== surface.diagnosis.baseFaceCount
        || !sameCodecValue(exactDiagnosis.basePositions, surface.diagnosis.basePositions)
        || !sameCodecValue(exactDiagnosis.baseNormals, surface.diagnosis.baseNormals))) {
        throw new Error("dryWeb exact diagnosis is not tied to current Surface diagnosis");
      }
    }
    dryWeb = {
      preview: {
        surfaceFingerprint: nonEmptyString(preview.surfaceFingerprint, "dryWeb.preview.surfaceFingerprint"),
        resolution: nonNegativeInteger(preview.resolution, "dryWeb.preview.resolution"),
        paintRevision: nonNegativeInteger(preview.paintRevision, "dryWeb.preview.paintRevision"),
        artworkGraphSnapshot: previewGraph,
        artworkGraphSourceKey: nonEmptyString(preview.artworkGraphSourceKey, "dryWeb.preview.artworkGraphSourceKey"),
        graph: previewGraphValidated,
        targetConnectionFacts: targetConnectionFacts as TargetedGridTargetConnectionFact[] | null,
        contactFloorFacts: contactFloorFacts as TargetedGridContactFloorFacts | null,
        facts,
        ...(canonicalAdoption ? { canonicalAdoption } : {}),
        computeMs: finiteNumber(preview.computeMs, "dryWeb.preview.computeMs"),
      },
      targetSource: { surfaceFingerprint: nonEmptyString(sourceTarget.surfaceFingerprint, "dryWeb.targetSource.surfaceFingerprint"), resolution: nonNegativeInteger(sourceTarget.resolution, "dryWeb.targetSource.resolution"), targets: cloneValue(sourceTarget.targets) as Array<OverhangDryWebTarget> },
      ...(exactDiagnosis ? { exactDiagnosis } : {}),
      ...(exactBinding ? { exactBinding } : {}),
    };
  }
  const canonicalDryWeb = root.canonicalDryWeb === undefined
    ? undefined
    : validateFkeiCanonicalDryWebArtifact(root.canonicalDryWeb);
  const riskDrivenLattice = root.riskDrivenLattice === undefined
    ? undefined
    : (() => {
      if (!canonicalDryWeb) throw new Error("riskDrivenLattice requires canonicalDryWeb");
      return validateFkeiRiskDrivenLatticeArtifact(root.riskDrivenLattice, canonicalDryWeb);
    })();
  let printProfile: FkeiPrintProfileArtifact | undefined;
  if (root.printProfile !== undefined) {
    const item = objectRecord(root.printProfile, "printProfile");
    onlyKeys(item, ["profile", "text", "filename", "sha256"], "printProfile");
    const profile = validateSkinPrintProfile(item.profile);
    const text = nonEmptyString(item.text, "printProfile.text");
    const filename = item.filename === undefined ? undefined : nonEmptyString(item.filename, "printProfile.filename");
    const sha256 = item.sha256 === undefined ? undefined : nonEmptyString(item.sha256, "printProfile.sha256");
    printProfile = { profile, text, ...(filename ? { filename } : {}), ...(sha256 ? { sha256 } : {}) };
  }
  if (surface) {
    if (!bindings.surface || !sameCodecValue(surface.binding, bindings.surface)) throw new Error("surface.binding must exactly match authoritative bindings.surface");
    if (surface.diagnosis.resolution !== bindings.surface.resolution) throw new Error("surface diagnosis resolution does not match authoritative binding");
    if (surface.diagnosis.metrics.thresholdDeg !== bindings.surface.angleThresholdDeg) throw new Error("surface diagnosis threshold does not match authoritative binding");
  }
  if (supportPaint && supportPaint.revision !== bindings.paintRevision) throw new Error("supportPaint revision does not match authoritative paint binding");
  if (artworkGraph) {
    if (!bindings.artworkGraph || artworkGraph.sourceKey !== bindings.artworkGraph.sourceKey || bindings.artworkGraph.patchSetRevision !== bindings.patchSetRevision) throw new Error("artworkGraph binding must exactly match authoritative bindings.artworkGraph");
    if (artworkGraph.snapshot.revision < 0) throw new Error("artworkGraph revision is invalid");
  }
  if (canonicalDryWeb) {
    if (!artworkGraph || !bindings.artworkGraph || !surface) throw new Error("canonicalDryWeb requires Surface and Artwork Graph");
    const binding = canonicalDryWeb.inputBinding;
    if (binding.shapeFingerprint !== bindings.shapeFingerprint
      || binding.patchSetRevision !== bindings.patchSetRevision
      || binding.paintRevision !== bindings.paintRevision
      || binding.artworkGraphSourceKey !== artworkGraph.sourceKey
      || binding.surfaceResolution !== surface.binding.resolution
      || binding.surfaceTargetLongestMm !== surface.binding.targetLongestMm
      || binding.surfaceAngleThresholdDeg !== surface.binding.angleThresholdDeg
      || binding.exactDiagnosisProvenanceSha256 !== canonicalDryWeb.exactDiagnosisSummary.provenanceSha256) {
      throw new Error("canonicalDryWeb input binding contradicts checkpoint identities");
    }
    if (fkeiCanonicalShapeSnapshotFingerprint(canonicalDryWeb.shapeSnapshot) !== bindings.shapeFingerprint) {
      throw new Error("canonicalDryWeb Shape snapshot does not match authoritative Shape fingerprint");
    }
  }
  if (dryWeb) {
    if (!bindings.dryWeb) throw new Error("dryWeb requires authoritative bindings.dryWeb");
    if (!bindings.surface) throw new Error("dryWeb requires authoritative bindings.surface");
    if (!bindings.artworkGraph) throw new Error("dryWeb requires authoritative bindings.artworkGraph");
    if (!surface) throw new Error("dryWeb requires the persisted current Surface artifact");
    const binding = bindings.dryWeb;
    if (dryWeb.preview.surfaceFingerprint !== binding.surfaceFingerprint || dryWeb.preview.resolution !== binding.resolution || dryWeb.preview.paintRevision !== binding.paintRevision || dryWeb.preview.artworkGraphSourceKey !== binding.artworkGraphSourceKey || dryWeb.targetSource.resolution !== binding.targetSourceResolution || dryWeb.targetSource.surfaceFingerprint !== binding.surfaceFingerprint) throw new Error("dryWeb binding facts do not match authoritative bindings.dryWeb");
    if (binding.surfaceFingerprint !== bindings.surface.surfaceFingerprint || binding.resolution !== bindings.surface.resolution || binding.paintRevision !== bindings.paintRevision || binding.artworkGraphSourceKey !== bindings.artworkGraph.sourceKey || binding.targetSourceResolution !== bindings.surface.resolution) throw new Error("dryWeb binding contradicts authoritative Surface/Paint/Artwork bindings");
    if (dryWeb.preview.surfaceFingerprint !== dryWeb.targetSource.surfaceFingerprint || dryWeb.preview.resolution !== dryWeb.targetSource.resolution) throw new Error("dryWeb target source facts do not match preview binding");
    if (artworkGraph && (dryWeb.preview.artworkGraphSourceKey !== artworkGraph.sourceKey || !sameCodecValue(dryWeb.preview.artworkGraphSnapshot, artworkGraph.snapshot))) throw new Error("dryWeb artwork snapshot facts do not match artworkGraph");
    validateDryWebTargetsAgainstLedger(dryWeb.targetSource.targets, dryWeb.preview.facts, surface.effectiveSupportResult, "dryWeb.targetSource");
    if (dryWeb.preview.facts !== null) {
      if (dryWeb.preview.facts.finalDryWebCount !== dryWeb.targetSource.targets.length) throw new Error("dryWeb routing facts do not match target source");
      if (dryWeb.preview.facts.finalDryWebCount !== dryWeb.preview.facts.automaticDryWebCount + dryWeb.preview.facts.blueAddedCount - dryWeb.preview.facts.orangeExcludedCount) throw new Error("dryWeb routing facts violate final count derivation");
      if (dryWeb.preview.facts.orangeExcludedCount > dryWeb.preview.facts.automaticDryWebCount) throw new Error("dryWeb routing exclusions exceed automatic source count");
    } else if (!dryWeb.preview.canonicalAdoption || dryWeb.preview.graph.kind !== "targetedGrid" || dryWeb.preview.targetConnectionFacts !== null || dryWeb.preview.contactFloorFacts !== null) {
      throw new Error("dryWeb null routing facts are not a canonical adoption state");
    }
    if (dryWeb.exactBinding && (!bindings.surface || !sameCodecValue(dryWeb.exactBinding, bindings.surface))) throw new Error("dryWeb exact binding must match authoritative bindings.surface");
    if (dryWeb.exactDiagnosis && dryWeb.exactBinding) {
      if (dryWeb.exactDiagnosis.resolution !== dryWeb.exactBinding.resolution) throw new Error("dryWeb exact diagnosis resolution does not match binding");
      if (dryWeb.exactDiagnosis.metrics.thresholdDeg !== dryWeb.exactBinding.angleThresholdDeg) throw new Error("dryWeb exact diagnosis threshold does not match binding");
      if (!surface || dryWeb.exactDiagnosis.generation !== surface.diagnosis.generation || !sameCodecValue(dryWeb.exactDiagnosis.basePositions, surface.diagnosis.basePositions) || !sameCodecValue(dryWeb.exactDiagnosis.baseNormals, surface.diagnosis.baseNormals)) throw new Error("dryWeb exact diagnosis requires the current Surface diagnosis source");
    }
  }
  return {
    schema: FKEI_SCHEMA,
    printApproval: false,
    savedAt,
    compatibility: {
      formatVersion: 1,
      studyId: "skin",
      typedEncoding: FKEI_TYPED_ENCODING,
      bindingModel: FKEI_BINDING_MODEL,
      ...(compatibility.appVersion === undefined ? {} : { appVersion: nonEmptyString(compatibility.appVersion, "compatibility.appVersion") }),
      ...(compatibility.generatorCommit === undefined ? {} : { generatorCommit: nonEmptyString(compatibility.generatorCommit, "compatibility.generatorCommit") }),
    },
    bindings,
    ...(completedStage === undefined ? {} : { completedStage }),
    shape,
    ...(supportPaint ? { supportPaint } : {}),
    ...(artworkGraph ? { artworkGraph } : {}),
    ...(surface ? { surface } : {}),
    ...(dryWeb ? { dryWeb } : {}),
    ...(canonicalDryWeb ? { canonicalDryWeb } : {}),
    ...(riskDrivenLattice ? { riskDrivenLattice } : {}),
    ...(printProfile ? { printProfile } : {}),
  };
}

export function validateFkei(value: unknown): FkeiDocument {
  return validateDocument(cloneValue(value));
}

export function captureFkei(input: FkeiCaptureInput): FkeiDocument {
  const { compatibility: inputCompatibility, ...inputFields } = input;
  const value = {
    ...inputFields,
    schema: FKEI_SCHEMA,
    printApproval: false,
    savedAt: input.savedAt ?? new Date().toISOString(),
    compatibility: {
      formatVersion: 1,
      studyId: "skin",
      typedEncoding: FKEI_TYPED_ENCODING,
      bindingModel: FKEI_BINDING_MODEL,
      ...(inputCompatibility?.appVersion === undefined ? {} : { appVersion: inputCompatibility.appVersion }),
      ...(inputCompatibility?.generatorCommit === undefined ? {} : { generatorCommit: inputCompatibility.generatorCommit }),
    },
  };
  return validateDocument(cloneValue(value));
}

function encodeDocument(document: FkeiDocument): Record<string, unknown> {
  const source = validateFkei(document);
  const budget = newCodecBudget();
  const seen = new WeakSet<object>();
  const encoded: Record<string, unknown> = {
    schema: source.schema,
    printApproval: false,
    savedAt: source.savedAt,
    compatibility: source.compatibility,
    bindings: source.bindings,
    shape: encodeFkeiValue(source.shape, seen, budget),
  };
  if (source.completedStage !== undefined) encoded.completedStage = source.completedStage;
  for (const key of ["supportPaint", "artworkGraph", "surface", "dryWeb", "canonicalDryWeb", "riskDrivenLattice", "printProfile"] as const) {
    if (source[key] !== undefined) encoded[key] = encodeFkeiValue(source[key], seen, budget);
  }
  return encoded;
}

export function serializeFkei(document: FkeiDocument): string {
  const serialized = JSON.stringify(encodeDocument(document), null, 2);
  assertJsonTextBudget(serialized);
  return serialized;
}

export function parseFkeiDocument(text: string): FkeiDocument {
  if (typeof text !== "string") throw new Error("FKEI JSON must be text");
  assertJsonTextBudget(text);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (error) { throw new Error(`FKEI JSON parse failed: ${error instanceof Error ? error.message : String(error)}`); }
  const root = objectRecord(parsed, "FKEI document");
  const decoded = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(root)) Object.defineProperty(decoded, key, { value: root[key], enumerable: true, writable: true, configurable: true });
  const budget = newCodecBudget();
  for (const key of ["shape", "supportPaint", "artworkGraph", "surface", "dryWeb", "canonicalDryWeb", "riskDrivenLattice", "printProfile"] as const) {
    if (Object.prototype.hasOwnProperty.call(root, key)) decoded[key] = decodeFkeiValue(root[key], budget);
  }
  if (Object.prototype.hasOwnProperty.call(root, "compatibility")) decoded.compatibility = cloneValue(root.compatibility);
  if (Object.prototype.hasOwnProperty.call(root, "bindings")) decoded.bindings = cloneValue(root.bindings);
  return validateDocument(decoded);
}

/** Open chooser discrimination: legacy Shape Recipe import stays supported. */
export function parseFkei(text: string): FkeiImportResult {
  if (typeof text !== "string") throw new Error("FKEI JSON must be text");
  assertJsonTextBudget(text);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (error) { throw new Error(`JSON parse failed: ${error instanceof Error ? error.message : String(error)}`); }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.prototype.hasOwnProperty.call(parsed, "schema")) {
    const schema = (parsed as Record<string, unknown>).schema;
    if (schema !== FKEI_SCHEMA) throw new Error(`Unsupported FKEI/Shape Recipe schema: ${String(schema)}`);
    return { kind: "fkei", document: parseFkeiDocument(text) };
  }
  if (Array.isArray(parsed)) return { kind: "legacy", entries: validateLegacyEntries(parsed) };
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).entries)) {
    const recipe = parsed as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(recipe, "formatVersion") && recipe.formatVersion !== 1) throw new Error(`Unsupported Shape Recipe schema: ${String(recipe.formatVersion)}`);
    return { kind: "legacy", entries: validateLegacyEntries(recipe.entries) };
  }
  throw new Error("認識できないFKEI/Shape Recipe形式です");
}

export const encodeFkei = encodeFkeiValue;
export const decodeFkei = decodeFkeiValue;

import { sha256Hex } from "../../lib/hash.ts";
import {
  createImportedHostInstance,
  createImportedHostSource,
  type HostInstanceTransform,
  type HostSourceInterpretation,
  type ImportedHostInstance,
  type ImportedHostSource,
} from "./externalStlHost.ts";
import {
  applyApprovedBoundaryRepair,
  type ApprovedHostRepairRequest,
  type ApprovedRepairedHost,
} from "./externalStlHostRepair.ts";
import {
  V6_HOST_ADAPTER_VERSION,
  V6_PLACEMENT_NORMAL_POLICY,
  type HostAuthoredFlowerMotif,
} from "./externalStlHostV6Adapter.ts";
import type { HostCapabilityAvailability, HostCapabilityReason } from "./externalStlHostVolume.ts";

/**
 * External Host projects deliberately use a new envelope. The existing
 * katachi.skin.fkei.v1 document and its restore semantics remain untouched.
 */
export const EXTERNAL_HOST_FKEI_SCHEMA = "katachi.skin.fkei.v2" as const;
export const EXTERNAL_HOST_FKEI_PROJECT_VERSION = 2 as const;
export const EXTERNAL_HOST_FKEI_TYPED_ENCODING = "base64-binary-v1" as const;
export const EXTERNAL_HOST_FKEI_BINDING_MODEL = "external-host-source-v0" as const;

const MAX_JSON_TEXT_BYTES = 128 * 1024 * 1024;
const MAX_SINGLE_BINARY_BYTES = 64 * 1024 * 1024;

export interface ExternalHostPersistedCapability {
  readonly surface: HostCapabilityAvailability;
  readonly signedVolume: HostCapabilityAvailability;
  readonly signedVolumeReason?: HostCapabilityReason;
  readonly validationStatus: "TOPOLOGICALLY_CLOSED" | "NOT_CLOSED";
  readonly selfIntersection: "NOT_PROVEN";
}

export interface ExternalHostProjectDocument {
  readonly schema: typeof EXTERNAL_HOST_FKEI_SCHEMA;
  readonly projectVersion: typeof EXTERNAL_HOST_FKEI_PROJECT_VERSION;
  readonly savedAt: string;
  readonly compatibility: {
    readonly studyId: "skin";
    readonly typedEncoding: typeof EXTERNAL_HOST_FKEI_TYPED_ENCODING;
    readonly bindingModel: typeof EXTERNAL_HOST_FKEI_BINDING_MODEL;
  };
  readonly referenceHost: {
    /** The Reference Host is never the printable artwork. */
    readonly printable: false;
    readonly source: {
      readonly bytes: ArrayBuffer;
      readonly sha256: string;
      readonly byteLength: number;
      readonly filename: string;
      readonly format: "ascii-stl" | "binary-stl";
      readonly interpretation: HostSourceInterpretation;
    };
    readonly transform: HostInstanceTransform;
    readonly repair: {
      readonly originalSourceSha256: string;
      readonly repairPolicyVersion: string;
      readonly approvedBoundaryLoopIndices: readonly number[];
      readonly repairParameters: Readonly<Record<string, string | number | boolean | readonly number[]>>;
      readonly expectedRepairedMeshFingerprint: string;
    };
    readonly expectedCapabilities: {
      readonly original: ExternalHostPersistedCapability;
      readonly repaired: ExternalHostPersistedCapability;
    };
  };
  readonly motifGeneration: {
    readonly adapterVersion: string;
    readonly placementNormalPolicy: typeof V6_PLACEMENT_NORMAL_POLICY;
    readonly seed: string;
    readonly source: "existing-v6-flower-generator";
  };
  /** Permanent artwork candidates. No printable=false field is allowed here. */
  readonly authoredMotifs: readonly HostAuthoredFlowerMotif[];
  readonly presentation: {
    readonly hostVisible: boolean;
  };
}

export interface ExternalHostRestorePlan {
  readonly document: ExternalHostProjectDocument;
  readonly source: ImportedHostSource;
  readonly original: ImportedHostInstance;
  readonly repaired: ApprovedRepairedHost;
  readonly motifs: readonly HostAuthoredFlowerMotif[];
  readonly hostVisible: boolean;
  readonly sourcePathRequired: false;
}

export interface ExternalHostAtomicRestoreTarget<Snapshot> {
  capture(): Snapshot;
  replace(plan: ExternalHostRestorePlan): void;
  restore(snapshot: Snapshot): void;
  redraw(): void;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(label: string): never {
  throw new Error(`External Host v2 validation failed: ${label}`);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
}

function integer(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number)) fail(`${label} must be an integer`);
  return number;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be non-empty`);
  return value;
}

function sha256(value: unknown, label: string): string {
  const result = nonEmptyString(value, label);
  if (!/^[0-9a-f]{64}$/.test(result)) fail(`${label} must be lowercase SHA-256 hex`);
  return result;
}

function exactKeys(value: UnknownRecord, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) fail(`${label} contains unknown field ${key}`);
}

function vec3(value: unknown, label: string): { x: number; y: number; z: number } {
  if (!isRecord(value)) fail(`${label} must be an object`);
  exactKeys(value, ["x", "y", "z"], label);
  return { x: finiteNumber(value.x, `${label}.x`), y: finiteNumber(value.y, `${label}.y`), z: finiteNumber(value.z, `${label}.z`) };
}

function quaternion(value: unknown, label: string): readonly [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) fail(`${label} must have four components`);
  const result = value.map((component, index) => finiteNumber(component, `${label}[${index}]`)) as [number, number, number, number];
  if (Math.abs(Math.hypot(...result) - 1) > 1e-6) fail(`${label} must be normalized`);
  return result;
}

function transform(value: unknown, label: string): HostInstanceTransform {
  if (!isRecord(value)) fail(`${label} must be an object`);
  exactKeys(value, ["translation", "rotation", "uniformScale"], label);
  const uniformScale = finiteNumber(value.uniformScale, `${label}.uniformScale`);
  if (!(uniformScale > 0)) fail(`${label}.uniformScale must be positive`);
  return { translation: vec3(value.translation, `${label}.translation`), rotation: quaternion(value.rotation, `${label}.rotation`), uniformScale };
}

function interpretation(value: unknown): HostSourceInterpretation {
  if (!isRecord(value)) fail("referenceHost.source.interpretation must be an object");
  exactKeys(value, ["unitStatus", "mmPerSourceUnit", "upAxis", "handedness", "importPolicyVersion"], "interpretation");
  if (value.unitStatus !== "explicit" && value.unitStatus !== "unresolved") fail("interpretation.unitStatus is invalid");
  if (value.unitStatus === "explicit") {
    const mm = finiteNumber(value.mmPerSourceUnit, "interpretation.mmPerSourceUnit");
    if (!(mm > 0)) fail("interpretation.mmPerSourceUnit must be positive");
  } else if (value.mmPerSourceUnit !== undefined) {
    fail("unresolved interpretation cannot carry mmPerSourceUnit");
  }
  if (value.upAxis !== "x" && value.upAxis !== "y" && value.upAxis !== "z") fail("interpretation.upAxis is invalid");
  if (value.handedness !== "right" && value.handedness !== "left") fail("interpretation.handedness is invalid");
  return {
    unitStatus: value.unitStatus,
    ...(value.mmPerSourceUnit === undefined ? {} : { mmPerSourceUnit: finiteNumber(value.mmPerSourceUnit, "interpretation.mmPerSourceUnit") }),
    upAxis: value.upAxis,
    handedness: value.handedness,
    importPolicyVersion: nonEmptyString(value.importPolicyVersion, "interpretation.importPolicyVersion"),
  } as HostSourceInterpretation;
}

function capability(value: unknown, label: string): ExternalHostPersistedCapability {
  if (!isRecord(value)) fail(`${label} must be an object`);
  exactKeys(value, ["surface", "signedVolume", "signedVolumeReason", "validationStatus", "selfIntersection"], label);
  if (value.surface !== "AVAILABLE" && value.surface !== "UNAVAILABLE") fail(`${label}.surface is invalid`);
  if (value.signedVolume !== "AVAILABLE" && value.signedVolume !== "UNAVAILABLE") fail(`${label}.signedVolume is invalid`);
  if (value.validationStatus !== "TOPOLOGICALLY_CLOSED" && value.validationStatus !== "NOT_CLOSED") fail(`${label}.validationStatus is invalid`);
  if (value.selfIntersection !== "NOT_PROVEN") fail(`${label}.selfIntersection is invalid`);
  if (value.signedVolumeReason !== undefined
    && !["NO_VALID_TRIANGLES", "OPEN_BOUNDARY", "NON_MANIFOLD", "DEGENERATE_TRIANGLES", "ORIENTATION_INCONSISTENT", "DISCONNECTED_COMPONENTS"].includes(String(value.signedVolumeReason))) {
    fail(`${label}.signedVolumeReason is invalid`);
  }
  return {
    surface: value.surface,
    signedVolume: value.signedVolume,
    ...(value.signedVolumeReason === undefined ? {} : { signedVolumeReason: value.signedVolumeReason as HostCapabilityReason }),
    validationStatus: value.validationStatus,
    selfIntersection: value.selfIntersection,
  };
}

function finiteRecord(value: unknown, label: string): void {
  if (!isRecord(value)) fail(`${label} must be an object`);
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "number") finiteNumber(item, `${label}.${key}`);
    else if (typeof item === "string" || typeof item === "boolean") continue;
    else if (Array.isArray(item)) item.forEach((entry, index) => integer(entry, `${label}.${key}[${index}]`));
    else fail(`${label}.${key} has an unsupported value`);
  }
}

function motifParams(value: unknown): NonNullable<HostAuthoredFlowerMotif["motifParams"]> {
  if (!isRecord(value)) fail("motif.motifParams must be an object");
  exactKeys(value, ["irregularity", "coinHoleRatio", "flatRingHoleRatio", "ringNodeCount", "ringTubeR", "ringWobbleR", "ringWobblePos", "flowerMotifPreset", "flowerPetalCount", "flowerShowCore", "flowerOpening", "flowerNeck", "flowerCoreSize", "flowerCupping", "flowerCoreLift", "flowerGrowthDifference", "flowerExpansion"], "motif.motifParams");
  for (const key of ["irregularity", "coinHoleRatio", "flatRingHoleRatio", "ringNodeCount", "ringTubeR", "ringWobbleR", "ringWobblePos", "flowerOpening", "flowerNeck", "flowerCoreSize", "flowerCupping", "flowerCoreLift", "flowerGrowthDifference", "flowerExpansion"]) {
    if (value[key] !== undefined) finiteNumber(value[key], `motif.motifParams.${key}`);
  }
  integer(value.flowerPetalCount, "motif.motifParams.flowerPetalCount");
  if (typeof value.flowerMotifPreset !== "string" || typeof value.flowerShowCore !== "boolean") fail("motif.motifParams enum fields are invalid");
  return value as unknown as NonNullable<HostAuthoredFlowerMotif["motifParams"]>;
}

function point(value: unknown, label: string): HostAuthoredFlowerMotif["points"][number] {
  if (!isRecord(value)) fail(`${label} must be an object`);
  exactKeys(value, ["x", "y", "z", "r", "role", "baseR", "fusionBaseR", "fusionR", "meshJoinR", "contactR", "contactScale", "ringPrimary"], label);
  const role: HostAuthoredFlowerMotif["points"][number]["role"] = value.role === undefined ? undefined : value.role as "motif" | "bridge" | "surfaceConnector";
  if (role !== undefined && role !== "motif" && role !== "bridge" && role !== "surfaceConnector") fail(`${label}.role is invalid`);
  const ringPrimary = value.ringPrimary === undefined ? undefined : value.ringPrimary;
  if (ringPrimary !== undefined && typeof ringPrimary !== "boolean") fail(`${label}.ringPrimary is invalid`);
  const result = {
    x: finiteNumber(value.x, `${label}.x`),
    y: finiteNumber(value.y, `${label}.y`),
    z: finiteNumber(value.z, `${label}.z`),
    r: finiteNumber(value.r, `${label}.r`),
    ...(role === undefined ? {} : { role }),
    ...(value.baseR === undefined ? {} : { baseR: finiteNumber(value.baseR, `${label}.baseR`) }),
    ...(value.fusionBaseR === undefined ? {} : { fusionBaseR: finiteNumber(value.fusionBaseR, `${label}.fusionBaseR`) }),
    ...(value.fusionR === undefined ? {} : { fusionR: finiteNumber(value.fusionR, `${label}.fusionR`) }),
    ...(value.meshJoinR === undefined ? {} : { meshJoinR: finiteNumber(value.meshJoinR, `${label}.meshJoinR`) }),
    ...(value.contactR === undefined ? {} : { contactR: finiteNumber(value.contactR, `${label}.contactR`) }),
    ...(value.contactScale === undefined ? {} : { contactScale: finiteNumber(value.contactScale, `${label}.contactScale`) }),
    ...(ringPrimary === undefined ? {} : { ringPrimary }),
  };
  return result;
}

function placement(value: unknown): HostAuthoredFlowerMotif["hostPlacement"] {
  if (!isRecord(value)) fail("motif.hostPlacement must be an object");
  exactKeys(value, ["sampleIndex", "triangleIndex", "barycentric", "position", "placementNormal", "tangentU", "tangentV", "triangleArea"], "motif.hostPlacement");
  if (!Array.isArray(value.barycentric) || value.barycentric.length !== 3) fail("motif.hostPlacement.barycentric is invalid");
  return {
    sampleIndex: integer(value.sampleIndex, "motif.hostPlacement.sampleIndex"),
    triangleIndex: integer(value.triangleIndex, "motif.hostPlacement.triangleIndex"),
    barycentric: value.barycentric.map((entry, index) => finiteNumber(entry, `motif.hostPlacement.barycentric[${index}]`)) as [number, number, number],
    position: vec3(value.position, "motif.hostPlacement.position"),
    placementNormal: vec3(value.placementNormal, "motif.hostPlacement.placementNormal"),
    tangentU: vec3(value.tangentU, "motif.hostPlacement.tangentU"),
    tangentV: vec3(value.tangentV, "motif.hostPlacement.tangentV"),
    triangleArea: finiteNumber(value.triangleArea, "motif.hostPlacement.triangleArea"),
  };
}

function validateMotif(value: unknown, index: number): HostAuthoredFlowerMotif {
  if (!isRecord(value)) fail(`authoredMotifs[${index}] must be an object`);
  exactKeys(value, ["id", "shape", "motifPlacement", "motifParams", "points", "hostAdapterVersion", "placementNormalPolicy", "authoredHostTransform", "hostPlacement", "source"], `authoredMotifs[${index}]`);
  if (Object.prototype.hasOwnProperty.call(value, "printable")) fail(`authoredMotifs[${index}] cannot carry printable`);
  if (value.shape !== "flower" || value.motifPlacement !== "surface") fail(`authoredMotifs[${index}] must be a surface flower`);
  if (value.source !== "existing-v6-flower-generator") fail(`authoredMotifs[${index}] source is invalid`);
  if (value.placementNormalPolicy !== V6_PLACEMENT_NORMAL_POLICY) fail(`authoredMotifs[${index}] normal policy is invalid`);
  const id = integer(value.id, `authoredMotifs[${index}].id`);
  if (!Array.isArray(value.points) || value.points.length === 0) fail(`authoredMotifs[${index}].points must be non-empty`);
  const motif = {
    id,
    shape: "flower" as const,
    motifPlacement: "surface" as const,
    motifParams: motifParams(value.motifParams),
    points: value.points.map((item, pointIndex) => point(item, `authoredMotifs[${index}].points[${pointIndex}]`)),
    hostAdapterVersion: nonEmptyString(value.hostAdapterVersion, `authoredMotifs[${index}].hostAdapterVersion`),
    placementNormalPolicy: V6_PLACEMENT_NORMAL_POLICY,
    authoredHostTransform: transform(value.authoredHostTransform, `authoredMotifs[${index}].authoredHostTransform`),
    hostPlacement: placement(value.hostPlacement),
    source: "existing-v6-flower-generator" as const,
  };
  return motif;
}

function base64(bytes: Uint8Array): string {
  let result = "";
  // Every non-final chunk must be divisible by three; otherwise each chunk
  // would introduce interior '=' padding and cease to be one base64 value.
  const chunkSize = 0x7ffe;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += btoa(String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))));
  }
  return result;
}

function bytesFromBase64(value: unknown, label: string): Uint8Array {
  if (typeof value !== "string" || value.length % 4 !== 0) fail(`${label} is not valid base64`);
  const firstPadding = typeof value === "string" ? value.indexOf("=") : -1;
  const contentEnd = firstPadding < 0 ? value.length : firstPadding;
  for (let index = 0; index < contentEnd; index += 1) {
    const code = value.charCodeAt(index);
    const valid = (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 43 || code === 47;
    if (!valid) fail(`${label} is not valid base64`);
  }
  if (firstPadding >= 0) {
    const paddingLength = value.length - firstPadding;
    if ((paddingLength !== 1 && paddingLength !== 2) || !/^=+$/.test(value.slice(firstPadding))) fail(`${label} is not valid base64`);
  }
  let binary: string;
  try { binary = atob(value); } catch { fail(`${label} is not valid base64`); }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodedBytes(bytes: ArrayBuffer): { readonly kind: "array-buffer"; readonly byteLength: number; readonly base64: string } {
  if (bytes.byteLength > MAX_SINGLE_BINARY_BYTES) fail("embedded STL exceeds the single binary budget");
  return { kind: "array-buffer", byteLength: bytes.byteLength, base64: base64(new Uint8Array(bytes)) };
}

function encodeSignedZero(value: unknown): unknown {
  if (typeof value === "number") return Object.is(value, -0) ? { kind: "negative-zero" } : value;
  if (Array.isArray(value)) return value.map((item) => encodeSignedZero(item));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeSignedZero(item)]));
  return value;
}

function decodeSignedZero(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => decodeSignedZero(item));
  if (isRecord(value)) {
    if (Object.keys(value).length === 1 && value.kind === "negative-zero") return -0;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeSignedZero(item)]));
  }
  return value;
}

function decodeBytes(value: unknown, runtimeBytes = false): ArrayBuffer {
  if (runtimeBytes && value instanceof ArrayBuffer) return value.slice(0);
  if (!isRecord(value)) fail("embedded source bytes must be tagged");
  exactKeys(value, ["kind", "byteLength", "base64"], "embedded source bytes");
  if (value.kind !== "array-buffer") fail("embedded source bytes have an unknown encoding");
  const byteLength = integer(value.byteLength, "embedded source byteLength");
  if (byteLength < 0 || byteLength > MAX_SINGLE_BINARY_BYTES) fail("embedded source byteLength is outside the budget");
  const bytes = bytesFromBase64(value.base64, "embedded source bytes");
  if (bytes.byteLength !== byteLength) fail("embedded source byteLength does not match base64");
  return bytes.slice().buffer as ArrayBuffer;
}

function capabilitySnapshot(instance: ImportedHostInstance): ExternalHostPersistedCapability {
  return {
    surface: instance.capabilities.surfaceCapability.availability,
    signedVolume: instance.capabilities.signedVolumeCapability.availability,
    ...(instance.capabilities.signedVolumeCapability.reason === undefined ? {} : { signedVolumeReason: instance.capabilities.signedVolumeCapability.reason }),
    validationStatus: instance.volumePreflight.validationStatus,
    selfIntersection: instance.volumePreflight.selfIntersection,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clonePreservingNumbers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => clonePreservingNumbers(item));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clonePreservingNumbers(item)]));
  return value;
}

function cloneMotifs(motifs: readonly HostAuthoredFlowerMotif[]): readonly HostAuthoredFlowerMotif[] {
  return clonePreservingNumbers(motifs) as readonly HostAuthoredFlowerMotif[];
}

function validateDocument(value: unknown, runtimeBytes = false): ExternalHostProjectDocument {
  if (!isRecord(value)) fail("document must be an object");
  exactKeys(value, ["schema", "projectVersion", "savedAt", "compatibility", "referenceHost", "motifGeneration", "authoredMotifs", "presentation"], "document");
  if (value.schema !== EXTERNAL_HOST_FKEI_SCHEMA) fail("schema is not katachi.skin.fkei.v2");
  if (value.projectVersion !== EXTERNAL_HOST_FKEI_PROJECT_VERSION) fail("projectVersion is not 2");
  if (typeof value.savedAt !== "string" || value.savedAt.length === 0) fail("savedAt must be non-empty");
  if (!isRecord(value.compatibility)) fail("compatibility must be an object");
  exactKeys(value.compatibility, ["studyId", "typedEncoding", "bindingModel"], "compatibility");
  if (value.compatibility.studyId !== "skin" || value.compatibility.typedEncoding !== EXTERNAL_HOST_FKEI_TYPED_ENCODING || value.compatibility.bindingModel !== EXTERNAL_HOST_FKEI_BINDING_MODEL) fail("compatibility is not supported");
  if (!isRecord(value.referenceHost)) fail("referenceHost must be an object");
  exactKeys(value.referenceHost, ["printable", "source", "transform", "repair", "expectedCapabilities"], "referenceHost");
  if (value.referenceHost.printable !== false) fail("Reference Host must be printable=false");
  if (!isRecord(value.referenceHost.source)) fail("referenceHost.source must be an object");
  exactKeys(value.referenceHost.source, ["bytes", "sha256", "byteLength", "filename", "format", "interpretation"], "referenceHost.source");
  const bytes = decodeBytes(value.referenceHost.source.bytes, runtimeBytes);
  const sourceByteLength = integer(value.referenceHost.source.byteLength, "referenceHost.source.byteLength");
  if (sourceByteLength !== bytes.byteLength) fail("referenceHost.source.byteLength does not match embedded bytes");
  if (sourceByteLength < 0) fail("referenceHost.source.byteLength is negative");
  const sourceHash = sha256(value.referenceHost.source.sha256, "referenceHost.source.sha256");
  if (value.referenceHost.source.format !== "ascii-stl" && value.referenceHost.source.format !== "binary-stl") fail("referenceHost.source.format is invalid");
  const sourceInterpretation = interpretation(value.referenceHost.source.interpretation);
  const instanceTransform = transform(value.referenceHost.transform, "referenceHost.transform");
  if (!isRecord(value.referenceHost.repair)) fail("referenceHost.repair must be an object");
  exactKeys(value.referenceHost.repair, ["originalSourceSha256", "repairPolicyVersion", "approvedBoundaryLoopIndices", "repairParameters", "expectedRepairedMeshFingerprint"], "referenceHost.repair");
  const repairSourceHash = sha256(value.referenceHost.repair.originalSourceSha256, "referenceHost.repair.originalSourceSha256");
  if (repairSourceHash !== sourceHash) fail("repair source hash does not match embedded source hash");
  if (!Array.isArray(value.referenceHost.repair.approvedBoundaryLoopIndices) || value.referenceHost.repair.approvedBoundaryLoopIndices.length === 0) fail("repair loop list must be non-empty");
  const loops = value.referenceHost.repair.approvedBoundaryLoopIndices.map((entry, index) => integer(entry, `repair.approvedBoundaryLoopIndices[${index}]`));
  if (new Set(loops).size !== loops.length || loops.some((entry) => entry < 0)) fail("repair loop list must be unique non-negative integers");
  finiteRecord(value.referenceHost.repair.repairParameters, "referenceHost.repair.repairParameters");
  const expectedFingerprint = sha256(value.referenceHost.repair.expectedRepairedMeshFingerprint, "referenceHost.repair.expectedRepairedMeshFingerprint");
  if (!isRecord(value.referenceHost.expectedCapabilities)) fail("referenceHost.expectedCapabilities must be an object");
  exactKeys(value.referenceHost.expectedCapabilities, ["original", "repaired"], "referenceHost.expectedCapabilities");
  const originalCapabilities = capability(value.referenceHost.expectedCapabilities.original, "referenceHost.expectedCapabilities.original");
  const repairedCapabilities = capability(value.referenceHost.expectedCapabilities.repaired, "referenceHost.expectedCapabilities.repaired");
  if (!isRecord(value.motifGeneration)) fail("motifGeneration must be an object");
  exactKeys(value.motifGeneration, ["adapterVersion", "placementNormalPolicy", "seed", "source"], "motifGeneration");
  if (value.motifGeneration.placementNormalPolicy !== V6_PLACEMENT_NORMAL_POLICY || value.motifGeneration.source !== "existing-v6-flower-generator") fail("motifGeneration policy/source is invalid");
  const adapterVersion = nonEmptyString(value.motifGeneration.adapterVersion, "motifGeneration.adapterVersion");
  const seed = nonEmptyString(value.motifGeneration.seed, "motifGeneration.seed");
  if (!Array.isArray(value.authoredMotifs)) fail("authoredMotifs must be an array");
  const motifs = value.authoredMotifs.map((item, index) => validateMotif(item, index));
  const ids = motifs.map((motif) => motif.id);
  if (new Set(ids).size !== ids.length) fail("authoredMotifs ids must be unique");
  if (!isRecord(value.presentation)) fail("presentation must be an object");
  exactKeys(value.presentation, ["hostVisible"], "presentation");
  if (typeof value.presentation.hostVisible !== "boolean") fail("presentation.hostVisible must be boolean");
  // Keep the decoded bytes in the returned object; this is the only deliberate
  // conversion from the wire representation back to runtime-owned bytes.
  return {
    schema: EXTERNAL_HOST_FKEI_SCHEMA,
    projectVersion: EXTERNAL_HOST_FKEI_PROJECT_VERSION,
    savedAt: value.savedAt,
    compatibility: { studyId: "skin", typedEncoding: EXTERNAL_HOST_FKEI_TYPED_ENCODING, bindingModel: EXTERNAL_HOST_FKEI_BINDING_MODEL },
    referenceHost: {
      printable: false,
      source: { bytes, sha256: sourceHash, byteLength: sourceByteLength, filename: nonEmptyString(value.referenceHost.source.filename, "referenceHost.source.filename"), format: value.referenceHost.source.format, interpretation: sourceInterpretation },
      transform: instanceTransform,
      repair: { originalSourceSha256: repairSourceHash, repairPolicyVersion: nonEmptyString(value.referenceHost.repair.repairPolicyVersion, "repair.repairPolicyVersion"), approvedBoundaryLoopIndices: loops, repairParameters: value.referenceHost.repair.repairParameters as Readonly<Record<string, string | number | boolean | readonly number[]>>, expectedRepairedMeshFingerprint: expectedFingerprint },
      expectedCapabilities: { original: originalCapabilities, repaired: repairedCapabilities },
    },
    motifGeneration: { adapterVersion, placementNormalPolicy: V6_PLACEMENT_NORMAL_POLICY, seed, source: "existing-v6-flower-generator" },
    authoredMotifs: motifs,
    presentation: { hostVisible: value.presentation.hostVisible },
  };
}

export function captureExternalHostProject(input: {
  readonly source: ImportedHostSource;
  readonly original: ImportedHostInstance;
  readonly repaired: ApprovedRepairedHost;
  readonly motifs: readonly HostAuthoredFlowerMotif[];
  readonly hostVisible: boolean;
  readonly seed: string;
  readonly savedAt?: string;
}): ExternalHostProjectDocument {
  if (input.original.source !== input.source || input.repaired.original.source !== input.source || input.repaired.repaired.source !== input.source) fail("source identity is not shared by the Host instances");
  if (input.source.sourceIdentity.sha256 !== input.repaired.materialization.provenance.originalSourceSha256) fail("repair provenance does not retain the original source hash");
  if (input.repaired.repaired.capabilities.signedVolumeCapability.availability !== "AVAILABLE") fail("cannot persist a Host without promoted Signed Volume");
  const document: ExternalHostProjectDocument = {
    schema: EXTERNAL_HOST_FKEI_SCHEMA,
    projectVersion: EXTERNAL_HOST_FKEI_PROJECT_VERSION,
    savedAt: input.savedAt ?? new Date().toISOString(),
    compatibility: { studyId: "skin", typedEncoding: EXTERNAL_HOST_FKEI_TYPED_ENCODING, bindingModel: EXTERNAL_HOST_FKEI_BINDING_MODEL },
    referenceHost: {
      printable: false,
      source: { bytes: input.source.bytes, sha256: input.source.sourceIdentity.sha256, byteLength: input.source.sourceIdentity.byteLength, filename: input.source.filename, format: input.source.format, interpretation: input.source.interpretation },
      transform: input.original.transform,
      repair: {
        originalSourceSha256: input.repaired.materialization.provenance.originalSourceSha256,
        repairPolicyVersion: input.repaired.materialization.provenance.repairPolicyVersion,
        approvedBoundaryLoopIndices: input.repaired.materialization.insertedBoundaryLoopIndices,
        repairParameters: input.repaired.materialization.provenance.repairParameters,
        expectedRepairedMeshFingerprint: input.repaired.materialization.repairedFingerprint,
      },
      expectedCapabilities: { original: capabilitySnapshot(input.original), repaired: capabilitySnapshot(input.repaired.repaired) },
    },
    motifGeneration: { adapterVersion: V6_HOST_ADAPTER_VERSION, placementNormalPolicy: V6_PLACEMENT_NORMAL_POLICY, seed: input.seed, source: "existing-v6-flower-generator" },
    authoredMotifs: cloneMotifs(input.motifs),
    presentation: { hostVisible: input.hostVisible },
  };
  validateDocument(document, true);
  return document;
}

export function serializeExternalHostProject(document: ExternalHostProjectDocument): string {
  const validated = validateDocument(document, true);
  const wire = {
    ...validated,
    referenceHost: {
      ...validated.referenceHost,
      source: { ...validated.referenceHost.source, bytes: encodedBytes(validated.referenceHost.source.bytes) },
    },
  };
  const text = JSON.stringify(encodeSignedZero(wire), null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_TEXT_BYTES) fail("serialized External Host project exceeds the JSON budget");
  return text;
}

export function parseExternalHostProject(text: string): ExternalHostProjectDocument {
  if (typeof text !== "string") fail("serialized project must be text");
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_TEXT_BYTES) fail("serialized External Host project exceeds the JSON budget");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { fail("serialized project is not valid JSON"); }
  return validateDocument(decodeSignedZero(parsed));
}

function assertCapability(actual: ExternalHostPersistedCapability, expected: ExternalHostPersistedCapability, label: string): void {
  if (!sameJson(actual, expected)) fail(`${label} capability changed during hydration`);
}

function assertTransform(actual: HostInstanceTransform, expected: HostInstanceTransform, label: string): void {
  if (!sameJson(actual, expected)) fail(`${label} transform changed during hydration`);
}

export async function hydrateExternalHostProject(input: ExternalHostProjectDocument | string): Promise<ExternalHostRestorePlan> {
  const document = typeof input === "string" ? parseExternalHostProject(input) : validateDocument(input, true);
  const bytes = document.referenceHost.source.bytes.slice(0);
  const actualHash = await sha256Hex(bytes);
  if (bytes.byteLength !== document.referenceHost.source.byteLength) fail("embedded source byteLength changed during hydration");
  if (actualHash !== document.referenceHost.source.sha256) fail("embedded source SHA-256 does not match the saved identity");
  const source = await createImportedHostSource(bytes, {
    filename: document.referenceHost.source.filename,
    interpretation: document.referenceHost.source.interpretation,
  });
  if (source.format !== document.referenceHost.source.format) fail("embedded source format changed during hydration");
  const original = createImportedHostInstance(source, document.referenceHost.transform);
  assertTransform(original.transform, document.referenceHost.transform, "reference Host");
  assertCapability(capabilitySnapshot(original), document.referenceHost.expectedCapabilities.original, "original Host");
  const repairRequest: ApprovedHostRepairRequest = {
    originalSourceSha256: document.referenceHost.repair.originalSourceSha256,
    repairPolicyVersion: document.referenceHost.repair.repairPolicyVersion,
    approvedBoundaryLoopIndices: document.referenceHost.repair.approvedBoundaryLoopIndices,
  };
  const repaired = await applyApprovedBoundaryRepair(original, repairRequest);
  if (repaired.materialization.repairedFingerprint !== document.referenceHost.repair.expectedRepairedMeshFingerprint) fail("repaired mesh fingerprint does not match the saved expectation");
  if (!sameJson(repaired.materialization.provenance.repairParameters, document.referenceHost.repair.repairParameters)) fail("repair parameters changed during hydration");
  assertTransform(repaired.repaired.transform, document.referenceHost.transform, "repaired Host");
  assertCapability(capabilitySnapshot(repaired.repaired), document.referenceHost.expectedCapabilities.repaired, "repaired Host");
  const motifs = cloneMotifs(document.authoredMotifs);
  for (const motif of motifs) {
    if (!sameJson(motif.authoredHostTransform, document.referenceHost.transform)) fail(`motif ${motif.id} transform is not the saved Host transform`);
    if (motif.hostAdapterVersion !== document.motifGeneration.adapterVersion) fail(`motif ${motif.id} adapter version does not match the project`);
    if (motif.placementNormalPolicy !== document.motifGeneration.placementNormalPolicy) fail(`motif ${motif.id} normal policy does not match the project`);
  }
  return Object.freeze({ document, source, original, repaired, motifs, hostVisible: document.presentation.hostVisible, sourcePathRequired: false });
}

export async function restoreExternalHostProjectAtomically<Snapshot>(
  input: ExternalHostProjectDocument | string,
  target: ExternalHostAtomicRestoreTarget<Snapshot>,
): Promise<ExternalHostRestorePlan> {
  const before = target.capture();
  // Hydration is completed before replace(), so a failed source/hash/repair
  // gate cannot disturb the previous live project.
  const plan = await hydrateExternalHostProject(input);
  try {
    target.replace(plan);
    target.redraw();
  } catch (error) {
    target.restore(before);
    target.redraw();
    throw error;
  }
  return plan;
}

import { sha256Hex } from "../../../lib/hash.ts";
import type {
  InternalStructureEdge,
  InternalStructureGraph,
  InternalStructureNode,
  Vector3Value,
} from "../voronoi.ts";

export const RESEARCH_PROJECT_SCHEMA = "katachi.skin.research-project.v0" as const;
export const RESEARCH_PROJECT_VERSION = 1 as const;
export const RESEARCH_PROJECT_ID = "skin-authoring-research-project-v0" as const;

export const F2_SOURCE_ID = "R4_A_F2_PRINT_PREPARATION/F2" as const;
export const F2_SOURCE_FILENAME = "structure.json" as const;
export const F2_SOURCE_BYTES = 14268298 as const;
export const F2_SOURCE_SHA256 = "610daf5181f0b98f2821c4944f3952f3e5053ffbb564d353822c57764d17e02d" as const;
export const F2_SOURCE_MEMBER_COUNT = 4351 as const;
export const F2_SOURCE_UNIQUE_MEMBER_COUNT = 4351 as const;
export const F2_SOURCE_BOUNDS = {
  min: [-101.5459594398984, -109.24250965350531, -0.2660574107474478],
  max: [101.7644806209678, 109.26732280264687, 208.1852747243118],
} as const;

export type ResearchSourceMode = "embedded-full-source" | "compact-fixture";
export type ResearchPoint = [number, number, number];
export type ResearchBounds = { min: ResearchPoint; max: ResearchPoint };

export interface ResearchSourceIdentity {
  sourceId: typeof F2_SOURCE_ID;
  filename: string;
  units: "mm";
  byteLength: number;
  sha256: string;
  sourceMemberCount: number;
  sourceUniqueMemberCount: number;
  loadedMemberCount: number;
  loadedUniqueMemberCount: number;
  omittedMemberCount: number;
  bounds: ResearchBounds;
  snapshotMode: ResearchSourceMode;
  sourceFileUnchanged: true;
}

export interface ResearchMember {
  id: string;
  kind: string;
  pointsMm: ResearchPoint[];
  parentId: string | null;
  targetId: string | null;
  radiusMm: number;
  diameterMm: number;
  tipDiameterMm: number | null;
  localTaperLengthMm: number;
  raw: Record<string, unknown>;
}

export interface ResearchSourceSnapshot {
  identity: ResearchSourceIdentity;
  topLevel: {
    parameters: unknown;
    summary: unknown;
  };
  members: ResearchMember[];
  sourceBytesBase64?: string;
}

export interface ResearchDiameterState {
  radiusMm: number;
  diameterMm: number;
  tipDiameterMm: number | null;
  localTaperLengthMm: number;
}

export interface ResearchDiameterDelta {
  id: string;
  memberId: string;
  before: ResearchDiameterState;
  after: ResearchDiameterState;
  sourceMeasurements: {
    meshVolumeMm3: number | null;
    bboxMm: ResearchPoint[] | null;
    meshSource: string | null;
  };
  derivedStatus: {
    meshVolume: "stale";
    bbox: "stale";
    support: "not-regenerated";
    fabrication: "not-generated";
    export: "not-generated";
  };
}

export interface ResearchProjectState {
  source: ResearchSourceSnapshot;
  history: ResearchDiameterDelta[];
  historyCursor: number;
}

export interface ResearchProjectDocument {
  schema: typeof RESEARCH_PROJECT_SCHEMA;
  version: typeof RESEARCH_PROJECT_VERSION;
  projectId: typeof RESEARCH_PROJECT_ID;
  savedAt: string;
  source: ResearchSourceSnapshot;
  edits: ResearchDiameterDelta[];
  historyCursor: number;
}

export interface ResearchEditEligibility {
  eligible: boolean;
  reason: string;
}

export interface ResearchPreview {
  graph: InternalStructureGraph;
  edgeIdByMemberId: Map<string, number>;
  positions: Float32Array;
  members: ResearchMember[];
}

const F2_DOWNLOAD_URL = "https://drive.google.com/file/d/10k2DNY51wJup6PlfECHVSzWqRrPZlHQ6/view";
const NUMERIC_TOLERANCE = 1e-7;

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function asText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty text`);
  return value;
}

function asFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function asNullableFinite(value: unknown, label: string): number | null {
  return value === null || value === undefined ? null : asFinite(value, label);
}

function asPoint(value: unknown, label: string): ResearchPoint {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must be a 3D point`);
  return [asFinite(value[0], `${label}[0]`), asFinite(value[1], `${label}[1]`), asFinite(value[2], `${label}[2]`)];
}

function asPoints(value: unknown, label: string): ResearchPoint[] {
  if (!Array.isArray(value) || value.length < 2) throw new Error(`${label} must contain at least two points`);
  return value.map((point, index) => asPoint(point, `${label}[${index}]`));
}

function asOptionalId(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : asText(value, label);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function closeEnough(left: number, right: number, tolerance = NUMERIC_TOLERANCE): boolean {
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

function emptyBounds(): ResearchBounds {
  return {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  };
}

function f2Bounds(): ResearchBounds {
  return { min: [...F2_SOURCE_BOUNDS.min], max: [...F2_SOURCE_BOUNDS.max] };
}

function boundsForMembers(members: ResearchMember[]): ResearchBounds {
  const bounds = emptyBounds();
  for (const member of members) {
    for (const point of member.pointsMm) {
      for (let axis = 0; axis < 3; axis += 1) {
        bounds.min[axis] = Math.min(bounds.min[axis], point[axis]);
        bounds.max[axis] = Math.max(bounds.max[axis], point[axis]);
      }
    }
  }
  if (!Number.isFinite(bounds.min[0])) throw new Error("source contains no finite points");
  return bounds;
}

function sameBounds(left: ResearchBounds, right: ResearchBounds): boolean {
  return left.min.every((value, index) => closeEnough(value, right.min[index]))
    && left.max.every((value, index) => closeEnough(value, right.max[index]));
}

function uniqueMemberCount(members: ResearchMember[]): number {
  return new Set(members.map((member) => member.id)).size;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("embedded source bytes are not valid base64");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function normalizeMember(value: unknown, index: number): ResearchMember {
  const raw = asRecord(value, `members[${index}]`);
  const id = asText(raw.id, `members[${index}].id`);
  const kind = asText(raw.kind, `members[${index}].kind`);
  const preservedRaw = raw.raw === undefined ? raw : asRecord(raw.raw, `${id}.raw`);
  const pointsMm = asPoints(raw.points_mm ?? raw.pointsMm, `${id}.points_mm`);
  const radiusMm = asFinite(raw.radius_mm ?? raw.radiusMm, `${id}.radius_mm`);
  const diameterMm = asFinite(raw.diameter_mm ?? raw.diameterMm, `${id}.diameter_mm`);
  const tipDiameterMm = asNullableFinite(raw.tip_diameter_mm ?? raw.tipDiameterMm, `${id}.tip_diameter_mm`);
  const localTaperLengthMm = asFinite(raw.local_taper_length_mm ?? raw.localTaperLengthMm ?? 0, `${id}.local_taper_length_mm`);
  return {
    id,
    kind,
    pointsMm,
    parentId: asOptionalId(raw.parent_id ?? raw.parentId, `${id}.parent_id`),
    targetId: asOptionalId(raw.target_id ?? raw.targetId, `${id}.target_id`),
    radiusMm,
    diameterMm,
    tipDiameterMm,
    localTaperLengthMm,
    raw: cloneJson(preservedRaw),
  };
}

function makeIdentity(options: {
  filename: string;
  byteLength: number;
  sha256: string;
  members: ResearchMember[];
  sourceMemberCount: number;
  sourceUniqueMemberCount: number;
  snapshotMode: ResearchSourceMode;
}): ResearchSourceIdentity {
  const loadedUniqueMemberCount = uniqueMemberCount(options.members);
  return {
    sourceId: F2_SOURCE_ID,
    filename: options.filename,
    units: "mm",
    byteLength: options.byteLength,
    sha256: options.sha256,
    sourceMemberCount: options.sourceMemberCount,
    sourceUniqueMemberCount: options.sourceUniqueMemberCount,
    loadedMemberCount: options.members.length,
    loadedUniqueMemberCount,
    omittedMemberCount: options.sourceMemberCount - options.members.length,
    bounds: boundsForMembers(options.members),
    snapshotMode: options.snapshotMode,
    sourceFileUnchanged: true,
  };
}

function parseSourceJson(value: unknown): { parameters: unknown; summary: unknown; members: ResearchMember[] } {
  const root = asRecord(value, "structure.json");
  if (!Array.isArray(root.members)) throw new Error("structure.json.members must be an array");
  const members = root.members.map((member, index) => normalizeMember(member, index));
  if (uniqueMemberCount(members) !== members.length) throw new Error("structure.json contains duplicate member ids");
  return { parameters: cloneJson(root.parameters ?? null), summary: cloneJson(root.summary ?? null), members };
}

export async function importResearchSource(file: File): Promise<ResearchSourceSnapshot> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("F2 structure.json is not valid JSON");
  }
  const source = parseSourceJson(parsed);
  const sha256 = await sha256Hex(bytes.buffer as ArrayBuffer);
  if (sha256 !== F2_SOURCE_SHA256 || bytes.byteLength !== F2_SOURCE_BYTES) {
    throw new Error(`F2 source identity mismatch; expected ${F2_SOURCE_BYTES} bytes / ${F2_SOURCE_SHA256}`);
  }
  if (source.members.length !== F2_SOURCE_MEMBER_COUNT || uniqueMemberCount(source.members) !== F2_SOURCE_UNIQUE_MEMBER_COUNT) {
    throw new Error("F2 source member count mismatch");
  }
  const identity = makeIdentity({
    filename: file.name || F2_SOURCE_FILENAME,
    byteLength: bytes.byteLength,
    sha256,
    members: source.members,
    sourceMemberCount: source.members.length,
    sourceUniqueMemberCount: uniqueMemberCount(source.members),
    snapshotMode: "embedded-full-source",
  });
  if (!sameBounds(identity.bounds, f2Bounds())) throw new Error("F2 source bounds mismatch");
  return {
    identity,
    topLevel: { parameters: source.parameters, summary: source.summary },
    members: source.members,
    sourceBytesBase64: bytesToBase64(bytes),
  };
}

function fixtureMember(options: {
  id: string;
  kind: string;
  pointsMm: ResearchPoint[];
  parentId: string;
  targetId: string;
  radiusMm: number;
  diameterMm: number;
  tipDiameterMm: number;
  localTaperLengthMm: number;
  raw?: Record<string, unknown>;
}): ResearchMember {
  return {
    id: options.id,
    kind: options.kind,
    pointsMm: options.pointsMm,
    parentId: options.parentId,
    targetId: options.targetId,
    radiusMm: options.radiusMm,
    diameterMm: options.diameterMm,
    tipDiameterMm: options.tipDiameterMm,
    localTaperLengthMm: options.localTaperLengthMm,
    raw: {
      id: options.id,
      kind: options.kind,
      points_mm: options.pointsMm,
      parent_id: options.parentId,
      target_id: options.targetId,
      radius_mm: options.radiusMm,
      diameter_mm: options.diameterMm,
      tip_diameter_mm: options.tipDiameterMm,
      local_taper_length_mm: options.localTaperLengthMm,
      ...(options.raw ?? {}),
    },
  };
}

export function createF2CompactFixture(): ResearchSourceSnapshot {
  const members = [
    fixtureMember({
      id: "C0002",
      kind: "SHARED_CORE",
      pointsMm: [[22.799999999999983, -42, 13.2], [34.79999999999998, 7.200000000000003, 19.2]],
      parentId: "R0000",
      targetId: "J0002",
      radiusMm: 1.5,
      diameterMm: 3,
      tipDiameterMm: 3,
      localTaperLengthMm: 0,
      raw: {
        length_mm: 50.99647046610187,
        mesh_volume_mm3: 364.5313456073809,
        bbox_mm: [[21.318574905395508, -43.48777389526367, 11.710418701171875], [36.28142547607422, 8.687774658203125, 20.6895809173584]],
        mesh_source: "J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs\\R4_V2_INTERNAL_PROPOSAL_V3\\data\\members\\C0002.npz",
      },
    }),
    fixtureMember({
      id: "C0003",
      kind: "SHARED_CORE",
      pointsMm: [[34.79999999999998, 7.200000000000003, 19.2], [1.1999999999999886, 45.60000000000001, 25.2]],
      parentId: "C0002",
      targetId: "J0003",
      radiusMm: 1.5,
      diameterMm: 3,
      tipDiameterMm: 3,
      localTaperLengthMm: 0,
      raw: { mesh_volume_mm3: 367.1474132151283 },
    }),
    fixtureMember({
      id: "R0000",
      kind: "ROOT_ADDITION",
      pointsMm: [[22.799999999999983, -42, -0.2660574107474478], [22.799999999999983, -42, 13.2]],
      parentId: "BED",
      targetId: "J0000",
      radiusMm: 1.5,
      diameterMm: 3,
      tipDiameterMm: 3,
      localTaperLengthMm: 0,
      raw: { mesh_volume_mm3: 106.01053019959318 },
    }),
    fixtureMember({
      id: "SP001",
      kind: "INTERNAL_SPATIAL_LINK",
      pointsMm: [[-38.98101806640625, 8.141134262084961, 24.167404174804688], [-40.79999923706055, 16.799999237060547, 66]],
      parentId: "C0006",
      targetId: "C0049",
      radiusMm: 1.5,
      diameterMm: 3,
      tipDiameterMm: 3,
      localTaperLengthMm: 0,
      raw: { mesh_source: "R4_AUTHOR_INTERNAL_SPATIAL_PROPOSALS/data/common_members/SP001.npz" },
    }),
    fixtureMember({
      id: "A4139",
      kind: "FLOWER_BACK_ATTACHMENT",
      pointsMm: [[20.537964630029236, 34.04018009539638, 29.333564604913768], [17.07117868072685, 28.856757624784237, 0.6765885376182585]],
      parentId: "CG0004",
      targetId: "F4139",
      radiusMm: 1.5,
      diameterMm: 3,
      tipDiameterMm: 0.5681746101950785,
      localTaperLengthMm: 3,
      raw: {
        radii_mm: [1.5, 1.5, 0.28408730509753927],
        compact_fixture_omits_intermediate_points: 13,
        source_mesh: "R4_INTERNAL_DEPTH_NETWORK_F2/data/members/A4139.npz",
      },
    }),
  ];
  return {
    identity: {
      sourceId: F2_SOURCE_ID,
      filename: F2_SOURCE_FILENAME,
      units: "mm",
      byteLength: F2_SOURCE_BYTES,
      sha256: F2_SOURCE_SHA256,
      sourceMemberCount: F2_SOURCE_MEMBER_COUNT,
      sourceUniqueMemberCount: F2_SOURCE_UNIQUE_MEMBER_COUNT,
      loadedMemberCount: members.length,
      loadedUniqueMemberCount: members.length,
      omittedMemberCount: F2_SOURCE_MEMBER_COUNT - members.length,
      bounds: f2Bounds(),
      snapshotMode: "compact-fixture",
      sourceFileUnchanged: true,
    },
    topLevel: {
      parameters: { internal_diameter_mm: 3, proposal_only: true },
      summary: { candidate: "C_DEEP_CELLULAR", stage: "AUTHOR INTERNAL REVIEW ONLY", compactFixture: true },
    },
    members,
  };
}

function sourceIdentityFromUnknown(value: unknown): ResearchSourceIdentity {
  const record = asRecord(value, "source.identity");
  const boundsRecord = asRecord(record.bounds, "source.identity.bounds");
  const snapshotMode = record.snapshotMode;
  if (snapshotMode !== "embedded-full-source" && snapshotMode !== "compact-fixture") {
    throw new Error("source.identity.snapshotMode is unknown");
  }
  const identity: ResearchSourceIdentity = {
    sourceId: asText(record.sourceId, "source.identity.sourceId") as typeof F2_SOURCE_ID,
    filename: asText(record.filename, "source.identity.filename"),
    units: record.units === "mm" ? "mm" : (() => { throw new Error("source.identity.units must be mm"); })(),
    byteLength: asFinite(record.byteLength, "source.identity.byteLength"),
    sha256: asText(record.sha256, "source.identity.sha256"),
    sourceMemberCount: asFinite(record.sourceMemberCount, "source.identity.sourceMemberCount"),
    sourceUniqueMemberCount: asFinite(record.sourceUniqueMemberCount, "source.identity.sourceUniqueMemberCount"),
    loadedMemberCount: asFinite(record.loadedMemberCount, "source.identity.loadedMemberCount"),
    loadedUniqueMemberCount: asFinite(record.loadedUniqueMemberCount, "source.identity.loadedUniqueMemberCount"),
    omittedMemberCount: asFinite(record.omittedMemberCount, "source.identity.omittedMemberCount"),
    bounds: { min: asPoint(boundsRecord.min, "source.identity.bounds.min"), max: asPoint(boundsRecord.max, "source.identity.bounds.max") },
    snapshotMode,
    sourceFileUnchanged: record.sourceFileUnchanged === true ? true : (() => { throw new Error("source identity is not marked unchanged"); })(),
  };
  if (identity.sourceId !== F2_SOURCE_ID || identity.units !== "mm") throw new Error("unsupported research source identity");
  return identity;
}

function sourceSnapshotFromUnknown(value: unknown): ResearchSourceSnapshot {
  const record = asRecord(value, "source");
  const identity = sourceIdentityFromUnknown(record.identity);
  if (!Array.isArray(record.members)) throw new Error("source.members must be an array");
  const members = record.members.map((member, index) => normalizeMember(member, index));
  if (members.length !== identity.loadedMemberCount) throw new Error("source loaded member count mismatch");
  if (uniqueMemberCount(members) !== identity.loadedUniqueMemberCount) throw new Error("source unique member count mismatch");
  if (!sameBounds(boundsForMembers(members), identity.bounds) && identity.snapshotMode === "embedded-full-source") {
    throw new Error("source bounds mismatch");
  }
  const sourceBytesBase64 = record.sourceBytesBase64 === undefined
    ? undefined
    : asText(record.sourceBytesBase64, "source.sourceBytesBase64");
  if (identity.snapshotMode === "embedded-full-source" && sourceBytesBase64 === undefined) {
    throw new Error("embedded full source bytes are missing");
  }
  if (identity.snapshotMode === "compact-fixture" && sourceBytesBase64 !== undefined) {
    throw new Error("compact fixture must not embed an unverified source file");
  }
  const topLevelRecord = asRecord(record.topLevel, "source.topLevel");
  return {
    identity,
    topLevel: { parameters: cloneJson(topLevelRecord.parameters ?? null), summary: cloneJson(topLevelRecord.summary ?? null) },
    members,
    ...(sourceBytesBase64 === undefined ? {} : { sourceBytesBase64 }),
  };
}

function deltaFromUnknown(value: unknown, index: number): ResearchDiameterDelta {
  const record = asRecord(value, `edits[${index}]`);
  const stateFromUnknown = (stateValue: unknown, label: string): ResearchDiameterState => {
    const state = asRecord(stateValue, label);
    return {
      radiusMm: asFinite(state.radiusMm, `${label}.radiusMm`),
      diameterMm: asFinite(state.diameterMm, `${label}.diameterMm`),
      tipDiameterMm: asNullableFinite(state.tipDiameterMm, `${label}.tipDiameterMm`),
      localTaperLengthMm: asFinite(state.localTaperLengthMm, `${label}.localTaperLengthMm`),
    };
  };
  const sourceMeasurements = asRecord(record.sourceMeasurements, `edits[${index}].sourceMeasurements`);
  const derivedStatus = asRecord(record.derivedStatus, `edits[${index}].derivedStatus`);
  if (derivedStatus.meshVolume !== "stale" || derivedStatus.bbox !== "stale"
    || derivedStatus.support !== "not-regenerated" || derivedStatus.fabrication !== "not-generated"
    || derivedStatus.export !== "not-generated") throw new Error(`edits[${index}] derived status is invalid`);
  const bbox = sourceMeasurements.bboxMm === null || sourceMeasurements.bboxMm === undefined
    ? null
    : asPoints(sourceMeasurements.bboxMm, `edits[${index}].sourceMeasurements.bboxMm`);
  return {
    id: asText(record.id, `edits[${index}].id`),
    memberId: asText(record.memberId, `edits[${index}].memberId`),
    before: stateFromUnknown(record.before, `edits[${index}].before`),
    after: stateFromUnknown(record.after, `edits[${index}].after`),
    sourceMeasurements: {
      meshVolumeMm3: asNullableFinite(sourceMeasurements.meshVolumeMm3, `edits[${index}].sourceMeasurements.meshVolumeMm3`),
      bboxMm: bbox,
      meshSource: sourceMeasurements.meshSource === null || sourceMeasurements.meshSource === undefined
        ? null
        : asText(sourceMeasurements.meshSource, `edits[${index}].sourceMeasurements.meshSource`),
    },
    derivedStatus: {
      meshVolume: "stale",
      bbox: "stale",
      support: "not-regenerated",
      fabrication: "not-generated",
      export: "not-generated",
    },
  };
}

export function parseResearchProjectDocument(text: string): ResearchProjectDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Research project is not valid JSON");
  }
  const record = asRecord(parsed, "research project");
  if (record.schema !== RESEARCH_PROJECT_SCHEMA) throw new Error("unknown research project schema");
  if (record.version !== RESEARCH_PROJECT_VERSION) throw new Error("unknown research project version");
  if (record.projectId !== RESEARCH_PROJECT_ID) throw new Error("wrong research project id");
  if (!Array.isArray(record.edits)) throw new Error("research project edits must be an array");
  const historyCursor = asFinite(record.historyCursor, "research project historyCursor");
  if (!Number.isSafeInteger(historyCursor) || historyCursor < 0 || historyCursor > record.edits.length) throw new Error("research project historyCursor is invalid");
  return {
    schema: RESEARCH_PROJECT_SCHEMA,
    version: RESEARCH_PROJECT_VERSION,
    projectId: RESEARCH_PROJECT_ID,
    savedAt: asText(record.savedAt, "research project savedAt"),
    source: sourceSnapshotFromUnknown(record.source),
    edits: record.edits.map((edit, index) => deltaFromUnknown(edit, index)),
    historyCursor,
  };
}

function measurementState(member: ResearchMember): ResearchDiameterState {
  return {
    radiusMm: member.radiusMm,
    diameterMm: member.diameterMm,
    tipDiameterMm: member.tipDiameterMm,
    localTaperLengthMm: member.localTaperLengthMm,
  };
}

function sameState(left: ResearchDiameterState, right: ResearchDiameterState): boolean {
  return closeEnough(left.radiusMm, right.radiusMm)
    && closeEnough(left.diameterMm, right.diameterMm)
    && (left.tipDiameterMm === null || right.tipDiameterMm === null
      ? left.tipDiameterMm === right.tipDiameterMm
      : closeEnough(left.tipDiameterMm, right.tipDiameterMm))
    && closeEnough(left.localTaperLengthMm, right.localTaperLengthMm);
}

export function researchEditEligibility(member: ResearchMember | undefined): ResearchEditEligibility {
  if (!member) return { eligible: false, reason: "member id not found" };
  if (member.kind !== "SHARED_CORE") return { eligible: false, reason: `${member.kind} is excluded from uniform edit` };
  if (member.pointsMm.length < 2) return { eligible: false, reason: "member has no complete centerline" };
  if (member.localTaperLengthMm !== 0) return { eligible: false, reason: "tapered member is excluded" };
  if (member.tipDiameterMm === null) return { eligible: false, reason: "tip diameter is missing" };
  if (!closeEnough(member.diameterMm, member.radiusMm * 2) || !closeEnough(member.tipDiameterMm, member.diameterMm)) {
    return { eligible: false, reason: "radius / diameter fields are inconsistent" };
  }
  const radii = member.raw.radii_mm;
  if (Array.isArray(radii) && radii.some((value) => typeof value !== "number" || !closeEnough(value, member.radiusMm))) {
    return { eligible: false, reason: "variable-radius member is excluded" };
  }
  return { eligible: true, reason: "uniform SHARED_CORE radius" };
}

function applyDeltaToMembers(members: ResearchMember[], delta: ResearchDiameterDelta, expected: "before" | "after"): ResearchMember[] {
  const index = members.findIndex((member) => member.id === delta.memberId);
  if (index < 0) throw new Error(`edit ${delta.id} references unknown member ${delta.memberId}`);
  const current = members[index];
  const eligibility = researchEditEligibility(current);
  if (!eligibility.eligible) throw new Error(`edit ${delta.id} cannot apply: ${eligibility.reason}`);
  const target = expected === "before" ? delta.before : delta.after;
  if (!sameState(measurementState(current), expected === "before" ? delta.after : delta.before)) {
    throw new Error(`edit ${delta.id} does not match current member ${delta.memberId}`);
  }
  return members.map((member, memberIndex) => memberIndex === index
    ? { ...member, radiusMm: target.radiusMm, diameterMm: target.diameterMm, tipDiameterMm: target.tipDiameterMm, localTaperLengthMm: target.localTaperLengthMm }
    : member);
}

export function materializeResearchMembers(state: ResearchProjectState): ResearchMember[] {
  let members = state.source.members.map((member) => ({ ...member, pointsMm: member.pointsMm.map((point) => [...point] as ResearchPoint), raw: cloneJson(member.raw) }));
  for (let index = 0; index < state.historyCursor; index += 1) members = applyDeltaToMembers(members, state.history[index], "after");
  return members;
}

export function getResearchMember(state: ResearchProjectState, memberId: string): ResearchMember | undefined {
  return materializeResearchMembers(state).find((member) => member.id === memberId);
}

export function applyResearchDiameterEdit(state: ResearchProjectState, memberId: string, diameterMm: number): ResearchProjectState {
  if (!Number.isFinite(diameterMm) || diameterMm <= 0) throw new Error("diameter must be positive");
  const members = materializeResearchMembers(state);
  const member = members.find((candidate) => candidate.id === memberId);
  const eligibility = researchEditEligibility(member);
  if (!eligibility.eligible || !member) throw new Error(`member ${memberId} is not editable: ${eligibility.reason}`);
  if (closeEnough(member.diameterMm, diameterMm)) throw new Error("diameter is unchanged");
  const raw = member.raw;
  const bboxValue = raw.bbox_mm;
  const bboxMm = bboxValue === undefined || bboxValue === null ? null : asPoints(bboxValue, `${memberId}.bbox_mm`);
  const delta: ResearchDiameterDelta = {
    id: `diameter:${memberId}:${state.historyCursor + 1}`,
    memberId,
    before: measurementState(member),
    after: { radiusMm: diameterMm / 2, diameterMm, tipDiameterMm: diameterMm, localTaperLengthMm: 0 },
    sourceMeasurements: {
      meshVolumeMm3: asNullableFinite(raw.mesh_volume_mm3, `${memberId}.mesh_volume_mm3`),
      bboxMm,
      meshSource: raw.mesh_source === undefined || raw.mesh_source === null ? null : asText(raw.mesh_source, `${memberId}.mesh_source`),
    },
    derivedStatus: {
      meshVolume: "stale",
      bbox: "stale",
      support: "not-regenerated",
      fabrication: "not-generated",
      export: "not-generated",
    },
  };
  const history = state.history.slice(0, state.historyCursor);
  history.push(delta);
  return { source: state.source, history, historyCursor: history.length };
}

export function undoResearchEdit(state: ResearchProjectState): ResearchProjectState {
  return state.historyCursor === 0 ? state : { ...state, historyCursor: state.historyCursor - 1 };
}

export function redoResearchEdit(state: ResearchProjectState): ResearchProjectState {
  return state.historyCursor === state.history.length ? state : { ...state, historyCursor: state.historyCursor + 1 };
}

export function createResearchProjectState(source: ResearchSourceSnapshot): ResearchProjectState {
  return { source, history: [], historyCursor: 0 };
}

export function buildResearchPreview(state: ResearchProjectState): ResearchPreview {
  const members = materializeResearchMembers(state);
  const nodes: InternalStructureNode[] = [];
  const edges: InternalStructureEdge[] = [];
  const edgeIdByMemberId = new Map<string, number>();
  const positions = new Float32Array(members.length * 6);
  for (const [index, member] of members.entries()) {
    const start = member.pointsMm[0];
    const end = member.pointsMm[member.pointsMm.length - 1];
    const startId = nodes.length;
    nodes.push({ id: startId, position: { x: start[0], y: start[1], z: start[2] }, radius: member.radiusMm });
    const endId = nodes.length;
    nodes.push({ id: endId, position: { x: end[0], y: end[1], z: end[2] }, radius: member.radiusMm });
    positions.set([...start, ...end], index * 6);
    const edgeId = edges.length;
    edges.push({ id: edgeId, start: startId, end: endId, radius: member.radiusMm });
    edgeIdByMemberId.set(member.id, edgeId);
  }
  const graph: InternalStructureGraph = {
    kind: "targetedGrid",
    nodes,
    edges,
    stats: {
      inputPoints: members.length * 2,
      delaunayTetrahedra: 0,
      candidateEdges: edges.length,
      clippedEdges: 0,
      removedShortEdges: 0,
      removedOutsideEdges: 0,
      removedIsolatedEdges: 0,
      gridNodeCount: nodes.length,
      gridEdgeCount: edges.length,
    },
  };
  return { graph, edgeIdByMemberId, positions, members };
}

export function createResearchProjectDocument(state: ResearchProjectState, savedAt = new Date().toISOString()): ResearchProjectDocument {
  return {
    schema: RESEARCH_PROJECT_SCHEMA,
    version: RESEARCH_PROJECT_VERSION,
    projectId: RESEARCH_PROJECT_ID,
    savedAt,
    source: state.source,
    edits: state.history,
    historyCursor: state.historyCursor,
  };
}

export function serializeResearchProject(state: ResearchProjectState, savedAt?: string): string {
  return JSON.stringify(createResearchProjectDocument(state, savedAt), null, 2);
}

export async function restoreResearchProject(text: string): Promise<ResearchProjectState> {
  const document = parseResearchProjectDocument(text);
  let source = document.source;
  if (source.identity.snapshotMode === "embedded-full-source") {
    const bytes = base64ToBytes(source.sourceBytesBase64!);
    if (bytes.byteLength !== source.identity.byteLength) throw new Error("embedded source byte length mismatch");
    const exactBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const verified = await importResearchSource(new File([exactBuffer], source.identity.filename, { type: "application/json" }));
    if (verified.identity.sha256 !== source.identity.sha256
      || verified.identity.sourceMemberCount !== source.identity.sourceMemberCount
      || !sameBounds(verified.identity.bounds, source.identity.bounds)) {
      throw new Error("embedded source identity verification failed");
    }
    source = verified;
  } else {
    if (source.identity.sha256 !== F2_SOURCE_SHA256 || source.identity.sourceMemberCount !== F2_SOURCE_MEMBER_COUNT) {
      throw new Error("compact fixture source identity is not recognized");
    }
  }
  const validationState: ResearchProjectState = { source, history: [], historyCursor: 0 };
  let members = source.members.map((member) => ({ ...member, pointsMm: member.pointsMm.map((point) => [...point] as ResearchPoint), raw: cloneJson(member.raw) }));
  for (const delta of document.edits) {
    members = applyDeltaToMembers(members, delta, "after");
    validationState.history.push(delta);
  }
  validationState.historyCursor = document.historyCursor;
  return validationState;
}

export function researchSourceSummary(source: ResearchSourceSnapshot): string {
  const mode = source.identity.snapshotMode === "embedded-full-source" ? "full source embedded" : "compact fixture / omitted refs";
  return `${source.identity.loadedMemberCount.toLocaleString()} / ${source.identity.sourceMemberCount.toLocaleString()} members · ${source.identity.loadedUniqueMemberCount.toLocaleString()} / ${source.identity.sourceUniqueMemberCount.toLocaleString()} unique ids · ${mode}`;
}

export function researchSourceReference(): string {
  return F2_DOWNLOAD_URL;
}

export function researchMemberKindSummary(member: ResearchMember | undefined): string {
  if (!member) return "member not found";
  const eligibility = researchEditEligibility(member);
  return `${member.id} · ${member.kind} · ${eligibility.eligible ? "uniform edit eligible" : eligibility.reason}`;
}

export function researchMemberVector(member: ResearchMember | undefined): Vector3Value | null {
  const first = member?.pointsMm[0];
  const last = member?.pointsMm[member.pointsMm.length - 1];
  if (!first || !last) return null;
  return { x: last[0] - first[0], y: last[1] - first[1], z: last[2] - first[2] };
}

import readerSnapshot from "./data/reader-snapshot.json";

export type Provenance = "RECORDED" | "DERIVED" | "NOT RECORDED";
export type CandidateId = "B_OPEN" | "B_PARTICIPATING";
export type LayerId = "host" | "junctions" | "core" | "crossLinks" | "attachments" | "motifs" | "fabricationD1" | "removableSupport";

export interface Fact<T> { value: T; provenance: Provenance; }
export interface Point3 { x: number; y: number; z: number; }
export interface JunctionRecord { id: string; position: Fact<Point3>; connectedMembers: Fact<string[]>; }
export interface MemberRecord {
  id: string;
  points: Point3[];
  radius: number;
  layer: LayerId;
  role: Fact<string>;
  parentBranch: Fact<string | null>;
  connectedJunctions: Fact<string[]>;
  target: Fact<string | null>;
  addedStage: Fact<string>;
  addedReason: Fact<string | null>;
}
export interface MotifRecord { id: string; points: Point3[]; radii: number[]; component: Fact<string | null>; }
export interface AstraResearchSnapshot {
  candidate: CandidateId;
  junctions: JunctionRecord[];
  members: MemberRecord[];
  motifs: MotifRecord[];
  attachments: MemberRecord[];
  fabricationAdditions: MemberRecord[];
  removableSupports: MemberRecord[];
  host: { vertices: number[][]; faces: number[][] };
  source: { package: string; candidate: CandidateId; sourceJunctionCount: Fact<number>; surfaceComponentCount: Fact<number>; };
}
export interface ConnectivityContext {
  connectedJunctions: Fact<string[]>;
  adjacentMembers: Fact<string[]>;
  recordedParent: Fact<string | null>;
  target: Fact<string | null>;
}

export function boundedPermanentDisplayRadius(radius: number): number { return Math.max(.28, Math.min(1.35, radius * .35)); }
export function boundedJunctionDisplayRadius(memberRadii: number[]): number {
  const average = memberRadii.length ? memberRadii.reduce((sum, radius) => sum + boundedPermanentDisplayRadius(radius), 0) / memberRadii.length : .28;
  return Math.max(.28, Math.min(.8, average * 1.15));
}

type GeometryRecord = { id: string; ancestry?: number[]; points_mm: number[][]; radius_mm?: number; kind?: string };
type AttachmentRecord = { id: string; parent_member_id: string; surface_component_id: number; branch_start_mm: number[]; branch_end_mm: number[]; classification?: string };
type D1Record = { id: string; a: number[]; b: number[]; radius_mm: number; role?: string; purpose?: string };
type D2Record = { id: string; a: number[]; b: number[]; tip?: number[]; anchor?: number[]; parent?: string; radius_mm?: number };
type CandidateData = { geometry: { structure: GeometryRecord[]; surface: { id: number; points_mm: number[][]; radii_mm: number[] }[]; parameters: { source_junction_count: number } }; attachments: { attachments: AttachmentRecord[]; component_target_count: number }; fabrication: { d1: { members: D1Record[] }; d2: { supports: D2Record[]; braces: D2Record[] } } };
type SnapshotData = { host: { vertices: number[][]; faces: number[][] }; surfaceComponents: { patch_component_mapping: { patch_id: number; component_ids_coarse: number[] }[] }; candidates: Record<CandidateId, CandidateData> };

const data = readerSnapshot as SnapshotData;
const openData = data.candidates.B_OPEN;

function point(values: number[]): Point3 { return { x: values[0] ?? 0, y: values[1] ?? 0, z: values[2] ?? 0 }; }
function points(values: number[][]): Point3[] { return values.map(point); }
function fact<T>(value: T, provenance: Provenance): Fact<T> { return { value, provenance }; }
function attachmentLookup(rows: AttachmentRecord[]): Map<string, AttachmentRecord> { return new Map(rows.map((row) => [row.id, row])); }

function baseMember(row: GeometryRecord, layer: LayerId, attachments: Map<string, AttachmentRecord>): MemberRecord {
  const attachment = attachments.get(row.id);
  const ancestry = row.ancestry ?? [];
  return {
    id: row.id,
    points: points(row.points_mm),
    radius: row.radius_mm ?? 1,
    layer,
    role: fact(row.kind ?? "unclassified", row.kind ? "RECORDED" : "NOT RECORDED"),
    parentBranch: fact(attachment?.parent_member_id ?? null, attachment ? "RECORDED" : "NOT RECORDED"),
    connectedJunctions: fact(ancestry.map((id) => `J${String(id).padStart(3, "0")}`), ancestry.length ? "RECORDED" : "NOT RECORDED"),
    target: fact(attachment ? `surface component ${attachment.surface_component_id}` : null, attachment ? "RECORDED" : "NOT RECORDED"),
    addedStage: fact(layer === "core" ? "OPEN core classification" : layer === "crossLinks" ? "participating-only cross-link classification" : "surface attachment classification", "DERIVED"),
    addedReason: fact(null, "NOT RECORDED"),
  };
}

function ruleMember(row: D1Record): MemberRecord {
  return {
    id: row.id,
    points: [point(row.a), point(row.b)],
    radius: row.radius_mm,
    layer: "fabricationD1",
    role: fact(row.role ?? "D1 member", row.role ? "RECORDED" : "NOT RECORDED"),
    parentBranch: fact(null, "NOT RECORDED"),
    connectedJunctions: fact([], "NOT RECORDED"),
    target: fact(null, "NOT RECORDED"),
    addedStage: fact("Fabrication D1 classification", "DERIVED"),
    addedReason: fact(row.purpose ?? null, row.purpose ? "RECORDED" : "NOT RECORDED"),
  };
}

function supportMember(row: D2Record): MemberRecord {
  return {
    id: row.id,
    points: [point(row.a), point(row.b), ...(row.tip ? [point(row.tip)] : []), ...(row.anchor ? [point(row.anchor)] : [])],
    radius: row.radius_mm ?? 0.8,
    layer: "removableSupport",
    role: fact("Removable support route classification", "DERIVED"),
    parentBranch: fact(row.parent ?? null, row.parent ? "RECORDED" : "NOT RECORDED"),
    connectedJunctions: fact([], "NOT RECORDED"),
    target: fact(null, "NOT RECORDED"),
    addedStage: fact("Fabrication D2 classification", "DERIVED"),
    addedReason: fact(null, "NOT RECORDED"),
  };
}

function buildJunctions(geometry: CandidateData["geometry"]): JunctionRecord[] {
  return Array.from({ length: geometry.parameters.source_junction_count }, (_, index) => {
    const id = `J${String(index).padStart(3, "0")}`;
    const rows = geometry.structure.filter((row) => row.ancestry?.includes(index));
    const endpoints = rows.flatMap((row) => [row.points_mm[0] ?? [0, 0, 0], row.points_mm[row.points_mm.length - 1] ?? [0, 0, 0]]);
    const average = endpoints.reduce((sum: number[], values) => sum.map((value, axis) => value + (values[axis] ?? 0)), [0, 0, 0]).map((value) => value / Math.max(1, endpoints.length));
    return { id, position: fact(point(average), "DERIVED"), connectedMembers: fact(rows.map((row) => row.id), rows.length ? "DERIVED" : "NOT RECORDED") };
  });
}

function buildMotifs(geometry: CandidateData["geometry"]): MotifRecord[] {
  return geometry.surface.map((row) => {
    const mapping = data.surfaceComponents.patch_component_mapping.find((entry) => entry.patch_id === row.id);
    const component = mapping?.component_ids_coarse[0];
    return { id: `M${row.id}`, points: points(row.points_mm), radii: row.radii_mm, component: fact(component === undefined ? null : `surface component ${component}`, component === undefined ? "NOT RECORDED" : "RECORDED") };
  });
}

export function buildAstraResearchSnapshot(candidate: CandidateId): AstraResearchSnapshot {
  const selected = data.candidates[candidate];
  const openCoreIds = new Set(openData.geometry.structure.filter((row) => row.kind === "inherited_botanical_core").map((row) => row.id));
  const attachments = attachmentLookup(selected.attachments.attachments);
  const members = selected.geometry.structure.map((row) => baseMember(row, openCoreIds.has(row.id) ? "core" : row.kind === "inherited_botanical_core" ? "crossLinks" : "attachments", attachments));
  const fabricationAdditions = selected.fabrication.d1.members.map(ruleMember);
  const removableSupports = [...selected.fabrication.d2.supports, ...selected.fabrication.d2.braces].map(supportMember);
  return {
    candidate,
    junctions: buildJunctions(selected.geometry),
    members,
    motifs: buildMotifs(selected.geometry),
    attachments: members.filter((member) => member.layer === "attachments"),
    fabricationAdditions,
    removableSupports,
    host: data.host,
    source: {
      package: "DUAL_PHYSICAL_INTERNAL_STRUCTURE_STUDY + FOUR_CANDIDATE_FABRICATION_D1_D2_ISLAND_RESOLUTION",
      candidate,
      sourceJunctionCount: fact(selected.geometry.parameters.source_junction_count, "RECORDED"),
      surfaceComponentCount: fact(selected.attachments.component_target_count, "RECORDED"),
    },
  };
}

export function deriveConnectivityContext(snapshot: AstraResearchSnapshot, member: MemberRecord): ConnectivityContext {
  const junctionIds = new Set(member.connectedJunctions.value);
  const adjacentMembers = snapshot.members
    .filter((other) => other.id !== member.id)
    .filter((other) => other.connectedJunctions.value.some((junctionId) => junctionIds.has(junctionId)))
    .map((other) => other.id);
  return {
    connectedJunctions: member.connectedJunctions,
    adjacentMembers: fact(adjacentMembers, junctionIds.size ? "DERIVED" : "NOT RECORDED"),
    recordedParent: member.parentBranch,
    target: member.target,
  };
}

import openGeometry from "./data/B_OPEN_geometry.json";
import participatingGeometry from "./data/B_PARTICIPATING_geometry.json";
import openAttachments from "./data/B_OPEN_attachments.json";
import participatingAttachments from "./data/B_PARTICIPATING_attachments.json";
import surfaceComponents from "./data/B_surface_components.json";
import openD1 from "./data/B_OPEN_D1_rules.json";
import participatingD1 from "./data/B_PARTICIPATING_D1_rules.json";
import openD2 from "./data/B_OPEN_D2_rules.json";
import participatingD2 from "./data/B_PARTICIPATING_D2_rules.json";
import host from "./data/B_host.json";

export type Provenance = "RECORDED" | "DERIVED" | "NOT RECORDED";
export type CandidateId = "B_OPEN" | "B_PARTICIPATING";
export type LayerId =
  | "host"
  | "junctions"
  | "core"
  | "crossLinks"
  | "attachments"
  | "motifs"
  | "fabricationD1"
  | "removableSupport";

export interface Fact<T> {
  value: T;
  provenance: Provenance;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface JunctionRecord {
  id: string;
  position: Fact<Point3>;
  connectedMembers: Fact<string[]>;
}

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

export interface MotifRecord {
  id: string;
  points: Point3[];
  radii: number[];
  component: Fact<string | null>;
}

export interface AstraResearchSnapshot {
  candidate: CandidateId;
  junctions: JunctionRecord[];
  members: MemberRecord[];
  motifs: MotifRecord[];
  attachments: MemberRecord[];
  fabricationAdditions: MemberRecord[];
  removableSupports: MemberRecord[];
  host: { vertices: number[][]; faces: number[][] };
  source: {
    package: string;
    candidate: CandidateId;
    sourceJunctionCount: Fact<number>;
    surfaceComponentCount: Fact<number>;
  };
}

type GeometryRecord = {
  id: string;
  ancestry?: number[];
  points_mm: number[][];
  radius_mm?: number;
  kind?: string;
};
type GeometryPackage = {
  id: CandidateId;
  structure: GeometryRecord[];
  surface: { id: number; points_mm: number[][]; radii_mm: number[] }[];
  parameters: { source_junction_count: number };
};
type AttachmentRecord = {
  id: string;
  parent_member_id: string;
  surface_component_id: number;
  branch_start_mm: number[];
  branch_end_mm: number[];
  classification: string;
};
type AttachmentPackage = { attachments: AttachmentRecord[]; component_target_count: number };
type D1Package = {
  members: { id: string; a: number[]; b: number[]; radius_mm: number; role: string; purpose: string }[];
};
type D2Package = {
  supports: { id: string; a: number[]; b: number[]; tip: number[]; anchor: number[]; parent?: string; radius_mm?: number }[];
  braces: { id: string; a: number[]; b: number[]; radius_mm: number }[];
};

const open = openGeometry as GeometryPackage;
const participating = participatingGeometry as GeometryPackage;
const openAttachmentData = openAttachments as AttachmentPackage;
const participatingAttachmentData = participatingAttachments as AttachmentPackage;
const openD1Data = openD1 as D1Package;
const participatingD1Data = participatingD1 as D1Package;
const openD2Data = openD2 as D2Package;
const participatingD2Data = participatingD2 as D2Package;
const surfaceData = surfaceComponents as { component_count: number; patch_component_mapping: { patch_id: number; component_ids_coarse: number[] }[] };
const hostData = host as { vertices: number[][]; faces: number[][] };

function point(values: number[]): Point3 {
  return { x: values[0] ?? 0, y: values[1] ?? 0, z: values[2] ?? 0 };
}

function memberPoints(values: number[][]): Point3[] {
  return values.map(point);
}

function fact<T>(value: T, provenance: Provenance): Fact<T> {
  return { value, provenance };
}

function attachmentLookup(rows: AttachmentRecord[]): Map<string, AttachmentRecord> {
  return new Map(rows.map((row) => [row.id, row]));
}

function baseMember(
  row: GeometryRecord,
  layer: LayerId,
  attachments: Map<string, AttachmentRecord>,
): MemberRecord {
  const attachment = attachments.get(row.id);
  const ancestry = row.ancestry ?? [];
  return {
    id: row.id,
    points: memberPoints(row.points_mm),
    radius: row.radius_mm ?? 1,
    layer,
    role: fact(row.kind ?? "unclassified", row.kind ? "RECORDED" : "NOT RECORDED"),
    parentBranch: fact(attachment?.parent_member_id ?? null, attachment ? "RECORDED" : "NOT RECORDED"),
    connectedJunctions: fact(ancestry.map((id) => `J${String(id).padStart(3, "0")}`), ancestry.length ? "RECORDED" : "NOT RECORDED"),
    target: fact(attachment ? `surface component ${attachment.surface_component_id}` : null, attachment ? "RECORDED" : "NOT RECORDED"),
    addedStage: fact(layer === "core" ? "OPEN core / inherited botanical core" : "surface growth", "RECORDED"),
    addedReason: fact(null, "NOT RECORDED"),
  };
}

function ruleMember(row: { id: string; a: number[]; b: number[]; radius_mm: number; role: string; purpose: string }): MemberRecord {
  return {
    id: row.id,
    points: [point(row.a), point(row.b)],
    radius: row.radius_mm,
    layer: "fabricationD1",
    role: fact(row.role, "RECORDED"),
    parentBranch: fact(null, "NOT RECORDED"),
    connectedJunctions: fact([], "NOT RECORDED"),
    target: fact(null, "NOT RECORDED"),
    addedStage: fact("Fabrication D1", "RECORDED"),
    addedReason: fact(row.purpose, "RECORDED"),
  };
}

function supportMember(row: { id: string; a: number[]; b: number[]; tip?: number[]; anchor?: number[]; parent?: string; radius_mm?: number }, layer: LayerId): MemberRecord {
  return {
    id: row.id,
    points: [point(row.a), point(row.b), ...(row.tip ? [point(row.tip)] : []), ...(row.anchor ? [point(row.anchor)] : [])],
    radius: row.radius_mm ?? 0.8,
    layer,
    role: fact(layer === "removableSupport" ? "Removable support" : "Support brace", "RECORDED"),
    parentBranch: fact(row.parent ?? null, row.parent ? "RECORDED" : "NOT RECORDED"),
    connectedJunctions: fact([], "NOT RECORDED"),
    target: fact(null, "NOT RECORDED"),
    addedStage: fact("Fabrication D2", "RECORDED"),
    addedReason: fact("external fabrication support", "RECORDED"),
  };
}

function buildJunctions(geometry: GeometryPackage): JunctionRecord[] {
  const count = geometry.parameters.source_junction_count;
  return Array.from({ length: count }, (_, index) => {
    const id = `J${String(index).padStart(3, "0")}`;
    const rows = geometry.structure.filter((row) => row.ancestry?.includes(index));
    const endpoints = rows.flatMap((row) => [row.points_mm[0] ?? [0, 0, 0], row.points_mm[row.points_mm.length - 1] ?? [0, 0, 0]]);
    const average = endpoints.reduce((sum: number[], values) => sum.map((v: number, axis: number) => v + (values[axis] ?? 0)), [0, 0, 0]).map((v: number) => v / Math.max(1, endpoints.length));
    return {
      id,
      position: fact(point(average), "DERIVED"),
      connectedMembers: fact(rows.map((row) => row.id), rows.length ? "RECORDED" : "NOT RECORDED"),
    };
  });
}

function buildMotifs(geometry: GeometryPackage): MotifRecord[] {
  return geometry.surface.map((row) => {
    const mapping = surfaceData.patch_component_mapping.find((entry) => entry.patch_id === row.id);
    const component = mapping?.component_ids_coarse[0];
    return {
      id: `M${row.id}`,
      points: memberPoints(row.points_mm),
      radii: row.radii_mm,
      component: fact(component === undefined ? null : `surface component ${component}`, component === undefined ? "NOT RECORDED" : "RECORDED"),
    };
  });
}

export function buildAstraResearchSnapshot(candidate: CandidateId): AstraResearchSnapshot {
  const geometry = candidate === "B_OPEN" ? open : participating;
  const attachmentData = candidate === "B_OPEN" ? openAttachmentData : participatingAttachmentData;
  const d1 = candidate === "B_OPEN" ? openD1Data : participatingD1Data;
  const d2 = candidate === "B_OPEN" ? openD2Data : participatingD2Data;
  const openCoreIds = new Set(open.structure.filter((row) => row.kind === "inherited_botanical_core").map((row) => row.id));
  const attachments = attachmentLookup(attachmentData.attachments);
  const members = geometry.structure.map((row) => baseMember(row, openCoreIds.has(row.id) ? "core" : row.kind === "inherited_botanical_core" ? "crossLinks" : "attachments", attachments));
  const attachmentMembers = members.filter((member) => member.layer === "attachments");
  const coreMembers = members.filter((member) => member.layer === "core");
  const crossLinks = members.filter((member) => member.layer === "crossLinks");
  const fabricationAdditions = d1.members.map(ruleMember);
  const removableSupports = [...d2.supports.map((row) => supportMember(row, "removableSupport")), ...d2.braces.map((row) => supportMember(row, "removableSupport"))];
  return {
    candidate,
    junctions: buildJunctions(geometry),
    members: [...coreMembers, ...crossLinks, ...attachmentMembers],
    motifs: buildMotifs(geometry),
    attachments: attachmentMembers,
    fabricationAdditions,
    removableSupports,
    host: hostData,
    source: {
      package: "DUAL_PHYSICAL_INTERNAL_STRUCTURE_STUDY + FOUR_CANDIDATE_FABRICATION_D1_D2_ISLAND_RESOLUTION",
      candidate,
      sourceJunctionCount: fact(geometry.parameters.source_junction_count, "RECORDED"),
      surfaceComponentCount: fact(attachmentData.component_target_count, "RECORDED"),
    },
  };
}

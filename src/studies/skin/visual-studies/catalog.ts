import type { InternalStructureGraph } from "../voronoi.ts";
import type { SkinRebuildBase, SkinRebuildProject } from "../rebuild/model.ts";
import type { Patch } from "../field.ts";

export const VISUAL_STUDY_IDS = [
  "field",
  "dust",
  "growth",
  "volume",
  "shadow",
  "scan",
  "residue",
  "matter",
] as const;

export type VisualStudyId = typeof VISUAL_STUDY_IDS[number];

export interface VisualStudyChoice {
  readonly id: VisualStudyId;
  readonly number: string;
  readonly title: string;
  readonly question: string;
}

export const VISUAL_STUDIES: readonly VisualStudyChoice[] = [
  { id: "field", number: "01", title: "FIELD", question: "Can the graph become a continuous influence field?" },
  { id: "dust", number: "02", title: "DUST", question: "Can relation arrive as particles before it becomes a line?" },
  { id: "growth", number: "03", title: "GROWTH", question: "Can support and connection grow out of the motifs?" },
  { id: "volume", number: "04", title: "VOLUME", question: "Can the network read as a cloud of occupied space?" },
  { id: "shadow", number: "05", title: "SHADOW", question: "How much form remains when the object withdraws?" },
  { id: "scan", number: "06", title: "SCAN", question: "What does one moving slice know about the whole?" },
  { id: "residue", number: "07", title: "RESIDUE", question: "Can rejected traces remain as visible process?" },
  { id: "matter", number: "08", title: "MATTER", question: "What happens when relations become soft material?" },
] as const;

export interface VisualStudySource {
  readonly graph: InternalStructureGraph;
  readonly base: SkinRebuildBase;
  readonly patterns: readonly Patch[];
  readonly project: SkinRebuildProject;
}

export function visualStudyChoice(id: VisualStudyId): VisualStudyChoice {
  return VISUAL_STUDIES.find((choice) => choice.id === id)!;
}

export function resolveVisualStudyId(value: string | null): VisualStudyId {
  return VISUAL_STUDY_IDS.includes(value as VisualStudyId) ? value as VisualStudyId : "field";
}

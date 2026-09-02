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
  { id: "field", number: "01", title: "FIELD", question: "What does the completed bouquet hold in common?" },
  { id: "dust", number: "02", title: "DUST", question: "Can a relation arrive before it becomes a line?" },
  { id: "growth", number: "03", title: "MUTUAL SUPPORT", question: "Can flowers remain while what supports them becomes visible?" },
  { id: "volume", number: "04", title: "VOLUME", question: "How does a bouquet occupy air between its parts?" },
  { id: "shadow", number: "05", title: "PERMANENT / CHANGING", question: "Can a permanent object keep changing through light?" },
  { id: "scan", number: "06", title: "SCAN", question: "What can one moving encounter know about the whole?" },
  { id: "residue", number: "07", title: "HAND REMAINS", question: "What of hesitation survives the completed graph?" },
  { id: "matter", number: "08", title: "SUPPORT BECOMES FORM", question: "When support takes form, where does the flower end?" },
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

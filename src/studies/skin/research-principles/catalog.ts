import { anastomosisDefinition } from "./studies/anastomosis.ts";
import { coarseningDefinition } from "./studies/coarsening.ts";
import { constrainedRelaxationDefinition } from "./studies/constrainedRelaxation.ts";
import { neighborExchangeDefinition } from "./studies/neighborExchange.ts";
import { pathAdaptationDefinition } from "./studies/pathAdaptation.ts";
import type { StudyDefinition, StudyKey } from "./runtime/studyTypes.ts";

export const STUDY_ORDER: readonly StudyKey[] = [
  "path-adaptation",
  "anastomosis",
  "constrained-relaxation",
  "neighbor-exchange",
  "coarsening",
];

export const STUDIES: Readonly<Record<StudyKey, StudyDefinition>> = {
  "path-adaptation": pathAdaptationDefinition,
  anastomosis: anastomosisDefinition,
  "constrained-relaxation": constrainedRelaxationDefinition,
  "neighbor-exchange": neighborExchangeDefinition,
  coarsening: coarseningDefinition,
};

export function studyFromQuery(value: string | null): StudyDefinition {
  if (value && value in STUDIES) return STUDIES[value as StudyKey];
  return STUDIES[STUDY_ORDER[0]];
}

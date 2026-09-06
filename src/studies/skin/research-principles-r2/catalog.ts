import { motifTensionDefinition } from "./studies/motifTension.ts";
import { multiReconnectDefinition } from "./studies/multiReconnect.ts";
import { relaxRewireDefinition } from "./studies/relaxRewire.ts";
import type { StudyDefinition, StudyKey } from "./runtime/types.ts";

export const STUDY_ORDER: readonly StudyKey[] = ["multi-reconnect", "motif-tension", "relax-rewire"];

export const STUDIES: Readonly<Record<StudyKey, StudyDefinition>> = {
  "multi-reconnect": multiReconnectDefinition,
  "motif-tension": motifTensionDefinition,
  "relax-rewire": relaxRewireDefinition,
};

export function studyFromQuery(value: string | null): StudyDefinition {
  if (value && value in STUDIES) return STUDIES[value as StudyKey];
  return STUDIES[STUDY_ORDER[0]];
}

import { redundantFreeformDefinition } from "./studies/redundantFreeform.ts";
import type { R3StudyDefinition } from "./runtime/types.ts";

export const STUDY = redundantFreeformDefinition satisfies R3StudyDefinition;

export function studyFromQuery(value: string | null): R3StudyDefinition {
  return value === STUDY.key ? STUDY : STUDY;
}

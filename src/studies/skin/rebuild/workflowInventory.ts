export type SkinRebuildWorkflowClassification = "current" | "future" | "legacy";

export const SKIN_REBUILD_STAGE_CLASSIFICATION = {
  current: ["skin-stage-1", "skin-stage-2", "skin-stage-6", "skin-stage-7", "skin-stage-8"],
  future: ["skin-stage-3", "skin-stage-4", "skin-stage-5"],
} as const;

export const SKIN_REBUILD_WORKFLOW_INVENTORY = [
  { id: "base-shape", classification: "current", surface: "stage-1" },
  { id: "surface-pattern", classification: "current", surface: "stage-2" },
  { id: "fkei-project", classification: "current", surface: "project-bar" },
  { id: "mesh-final-validation-export", classification: "current", surface: "stages-6-8" },
  { id: "graph-dryweb-spider-network", classification: "future", surface: "stages-3-5" },
  { id: "auxiliary-frozen-research", classification: "legacy", surface: "advanced-shelf" },
] as const satisfies readonly {
  id: string;
  classification: SkinRebuildWorkflowClassification;
  surface: string;
}[];

export const SKIN_REBUILD_TEST_CLASSIFICATION = {
  permanent: ["model", "fkei", "original-surface-pipeline", "cached-mesh-export"],
  migration: ["original-editor-shell", "workflow-phase-navigator", "workflow-inventory"],
  legacy: ["original-skin-json-ui", "auxiliary-frozen-research"],
} as const;

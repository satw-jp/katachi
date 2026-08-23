/**
 * Presentation vocabulary only.  A profile explains the current creation
 * route; it never changes a recipe, a field, or Katachi's overall purpose.
 */
export interface WorkflowProfile {
  id: string;
  name: string;
  description: string;
  stages: readonly string[];
}

export const CURRENT_WORKFLOW_PROFILE: WorkflowProfile = {
  id: "three-dimensional-lace",
  name: "立体レース",
  description: "現在の制作テーマです。Katachi 全体の恒久的な用途を定めるものではありません。",
  stages: ["ベース", "原理配置", "空隙調整", "作者編集", "N分割"],
};

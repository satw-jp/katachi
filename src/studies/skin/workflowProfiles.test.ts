import assert from "node:assert/strict";
import { CURRENT_WORKFLOW_PROFILE } from "./workflowProfiles.ts";

export function runWorkflowProfileTests(test: (name: string, fn: () => void) => void): void {
  test("workflow profile: 立体レース is presentation-only and has the authored sequence", () => {
    assert.equal(CURRENT_WORKFLOW_PROFILE.name, "立体レース");
    assert.deepEqual(CURRENT_WORKFLOW_PROFILE.stages, ["ベース", "原理配置", "空隙調整", "作者編集", "N分割"]);
    assert.match(CURRENT_WORKFLOW_PROFILE.description, /恒久的な用途を定めるものではありません/);
  });
}

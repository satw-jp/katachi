import assert from "node:assert/strict";
import { measureWorkflowGuideLayout } from "./workflowGuideLayout.ts";

const cases = [
  { name: "current browser", viewport: 748, content: 262, pane: 606, expectedGuide: 262, scrolls: false },
  { name: "content exceeds 50vh", viewport: 400, content: 262, pane: 258, expectedGuide: 200, scrolls: true },
  { name: "1920x1080", viewport: 1080, content: 262, pane: 938, expectedGuide: 262, scrolls: false },
] as const;

for (const testCase of cases) {
  const metrics = measureWorkflowGuideLayout(testCase.viewport, testCase.content, testCase.pane);
  assert.equal(metrics.guideHeightPx, testCase.expectedGuide, `${testCase.name}: guide height`);
  assert.ok(metrics.guideHeightPx <= testCase.viewport * 0.5, `${testCase.name}: guide exceeds 50vh`);
  assert.equal(metrics.guideScrolls, testCase.scrolls, `${testCase.name}: inner Guide scrolling`);
  assert.ok(metrics.lowerRegionVisible, `${testCase.name}: lower Stage/Properties region is displaced`);
  assert.equal(metrics.lowerHeightPx, testCase.pane - testCase.expectedGuide, `${testCase.name}: lower region height`);
}

assert.throws(() => measureWorkflowGuideLayout(Number.NaN, 1, 1), /finite/);
assert.throws(() => measureWorkflowGuideLayout(100, -1, 1), /non-negative/);

console.log("workflow guide layout tests passed (17 assertions)");

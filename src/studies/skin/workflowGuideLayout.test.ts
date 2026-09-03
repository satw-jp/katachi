import assert from "node:assert/strict";
import { measureWorkflowGuideLayout } from "./workflowGuideLayout.ts";

const cases = [
  { name: "current browser", viewport: 720, content: 428, pane: 578, expectedUpper: 360, scrolls: true },
  { name: "content exceeds 50vh", viewport: 400, content: 428, pane: 258, expectedUpper: 200, scrolls: true },
  { name: "1920x1080", viewport: 1080, content: 428, pane: 938, expectedUpper: 428, scrolls: false },
] as const;

for (const testCase of cases) {
  const metrics = measureWorkflowGuideLayout(testCase.viewport, testCase.content, testCase.pane);
  assert.equal(metrics.upperStackHeightPx, testCase.expectedUpper, `${testCase.name}: upper stack height`);
  assert.ok(metrics.upperStackHeightPx <= testCase.viewport * 0.5, `${testCase.name}: upper stack exceeds 50vh`);
  assert.equal(metrics.upperStackScrolls, testCase.scrolls, `${testCase.name}: inner upper stack scrolling`);
  assert.ok(metrics.lowerRegionVisible, `${testCase.name}: lower Stage/Properties region is displaced`);
  assert.equal(metrics.lowerHeightPx, testCase.pane - testCase.expectedUpper, `${testCase.name}: lower region height`);
}

assert.throws(() => measureWorkflowGuideLayout(Number.NaN, 1, 1), /finite/);
assert.throws(() => measureWorkflowGuideLayout(100, -1, 1), /non-negative/);

console.log("workflow guide layout tests passed (17 assertions)");

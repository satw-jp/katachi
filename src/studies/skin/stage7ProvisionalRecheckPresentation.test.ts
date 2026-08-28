import {
  createStage7ProvisionalRecheckPresentation,
  type Stage7ProvisionalRecheckCounts,
} from "./stage7ProvisionalRecheckPresentation.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const counts = (teal: number, orange: number, red: number): Stage7ProvisionalRecheckCounts => ({ teal, orange, red });

for (const [label, input] of [
  ["missing", null],
  ["running", { actionReady: false, running: true, current: false, stale: false, error: null, baseline: counts(1, 2, 3), provisional: counts(2, 2, 2), elapsedMs: 1100 }],
  ["error", { actionReady: false, running: false, current: false, stale: false, error: "worker", baseline: counts(1, 2, 3), provisional: counts(2, 2, 2), elapsedMs: 2200 }],
  ["stale", { actionReady: false, running: false, current: false, stale: true, error: null, baseline: counts(1, 2, 3), provisional: counts(2, 2, 2), elapsedMs: 3300 }],
] as const) {
  const presentation = createStage7ProvisionalRecheckPresentation(input);
  assert(presentation.state === label || (label === "missing" && presentation.state === "missing"), `${label} state`);
  assert(!presentation.current, `${label} is not current`);
  assert(!presentation.baseline && !presentation.provisional && !presentation.deltas, `${label} hides old counts`);
  assert(presentation.baselineRed === null && presentation.provisionalRed === null, `${label} hides scalar counts`);
}

{
  const presentation = createStage7ProvisionalRecheckPresentation({
    actionReady: true,
    running: false,
    current: true,
    stale: false,
    error: null,
    baseline: counts(4, 3, 8),
    provisional: counts(6, 2, 3),
    elapsedMs: 12_500,
  });
  assert(presentation.state === "current" && presentation.enabled && presentation.current, "improved current");
  assert(presentation.baselineTeal === 4 && presentation.baselineOrange === 3 && presentation.baselineRed === 8, "baseline colors");
  assert(presentation.provisionalTeal === 6 && presentation.provisionalOrange === 2 && presentation.provisionalRed === 3, "provisional colors");
  assert(presentation.tealDelta === 2 && presentation.orangeDelta === -1 && presentation.redDelta === -5, "signed deltas");
  assert(presentation.redReduction === 5 && presentation.status === "improved", "red reduction status");
  assert(presentation.elapsedSeconds === 12.5, "elapsed seconds");
  assert(presentation.reason.includes("red 3 candidate") && !presentation.reason.toLowerCase().includes("printable"), "red zero wording is honest");
  assert(Object.isFrozen(presentation.baseline) && Object.isFrozen(presentation.deltas), "returned counts immutable");
}

for (const [red, expected] of [[5, "unchanged"], [7, "worse"]] as const) {
  const presentation = createStage7ProvisionalRecheckPresentation({
    actionReady: true,
    running: false,
    current: true,
    stale: false,
    error: null,
    baseline: counts(1, 2, 5),
    provisional: counts(1, 2, red),
    elapsedMs: 0,
  });
  assert(presentation.status === expected, `${expected} status`);
  assert(presentation.redReduction === 5 - red && presentation.redDelta === red - 5, `${expected} signed red delta`);
}

{
  const baseline = counts(2, 3, 0);
  const provisional = counts(4, 1, 0);
  const first = createStage7ProvisionalRecheckPresentation({
    actionReady: true, running: false, current: true, stale: false, error: null,
    baseline, provisional, elapsedMs: 1000,
  });
  const second = createStage7ProvisionalRecheckPresentation({
    actionReady: true, running: false, current: true, stale: false, error: null,
    baseline, provisional, elapsedMs: 1000,
  });
  assert(JSON.stringify(first) === JSON.stringify(second), "deterministic output");
  assert(first.baselineRed === 0 && first.provisionalRed === 0 && first.reason.includes("0 candidate"), "red 0 candidate wording");
  assert(!first.reason.toLowerCase().includes("printable"), "red 0 never claims printable");
  (baseline as { teal: number; orange: number; red: number }).red = 9;
  (provisional as { teal: number; orange: number; red: number }).red = 8;
  assert(first.baselineRed === 0 && first.provisionalRed === 0, "source mutation cannot alter output");
}

for (const bad of [
  { teal: -1, orange: 0, red: 0 },
  { teal: 0.5, orange: 0, red: 0 },
  { teal: 0, orange: Number.NaN, red: 0 },
] as const) {
  const presentation = createStage7ProvisionalRecheckPresentation({
    actionReady: true, running: false, current: true, stale: false, error: null,
    baseline: bad, provisional: counts(1, 1, 1), elapsedMs: null,
  });
  assert(presentation.state === "missing" && !presentation.current, "invalid counts fail closed");
  assert(presentation.baselineRed === null && presentation.provisionalRed === null, "invalid counts hidden");
}

console.log("stage7ProvisionalRecheckPresentation.test.ts: all assertions passed");

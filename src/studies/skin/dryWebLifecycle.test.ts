import assert from "node:assert/strict";
import {
  createDryWebExactRecheckPresentation,
  type DryWebExactRecheckPresentationInput,
} from "./dryWebLifecycle.ts";

const readyInput = (): DryWebExactRecheckPresentationInput => ({
  targetedGrid: true,
  graphCurrent: true,
  graphKind: "targetedGrid",
  stage3BoundaryCurrent: true,
  hasGraph: true,
  exactFactsCurrent: false,
  runActive: false,
});

// Generator completion publishes a current graph immediately, while Stage 7
// remains empty until the explicit exact-recheck action is chosen.
const ready = createDryWebExactRecheckPresentation(readyInput());
assert.equal(ready.state, "ready");
assert.equal(ready.enabled, true);
assert.equal(ready.exactFactsCurrent, false);
assert.match(ready.reason, /Dry Web生成が完了しました/);
assert.match(ready.reason, /exact診断は未実行/);

const missing = createDryWebExactRecheckPresentation({
  ...readyInput(),
  graphCurrent: false,
  graphKind: null,
  hasGraph: false,
});
assert.equal(missing.state, "missing");
assert.equal(missing.enabled, false);
assert.equal(missing.exactFactsCurrent, false);

const stale = createDryWebExactRecheckPresentation({
  ...readyInput(),
  graphCurrent: false,
});
assert.equal(stale.state, "stale");
assert.equal(stale.enabled, false);
assert.equal(stale.exactFactsCurrent, false);
assert.match(stale.reason, /旧Stage 7 exact factsは表示しません/);

const running = createDryWebExactRecheckPresentation({
  ...readyInput(),
  exactFactsCurrent: true,
  runActive: true,
});
assert.equal(running.state, "running");
assert.equal(running.enabled, false);
assert.equal(running.exactFactsCurrent, false);
assert.match(running.reason, /旧Stage 7 factsは表示しません/);

// Re-running is available only from the current graph, and publishing a new
// generator result supplies exactFactsCurrent=false, clearing the old exact
// presentation rather than carrying its counts forward.
const currentExact = createDryWebExactRecheckPresentation({
  ...readyInput(),
  exactFactsCurrent: true,
});
assert.equal(currentExact.state, "current");
assert.equal(currentExact.exactFactsCurrent, true);
const newGeneratorResult = createDryWebExactRecheckPresentation(readyInput());
assert.equal(newGeneratorResult.state, "ready");
assert.equal(newGeneratorResult.exactFactsCurrent, false);
assert.match(newGeneratorResult.reason, /exact診断は未実行/);

// The UI callback is guarded by the same pure readiness result. A second
// dispatch sees the active-run state and cannot invoke the exact starter.
let dispatchCount = 0;
let dispatchInput = readyInput();
const dispatch = (): void => {
  const presentation = createDryWebExactRecheckPresentation(dispatchInput);
  if (!presentation.enabled) return;
  dispatchCount++;
  dispatchInput = { ...dispatchInput, runActive: true };
};
dispatch();
dispatch();
assert.equal(dispatchCount, 1);

const immutableInput = readyInput();
const immutableBefore = JSON.stringify(immutableInput);
createDryWebExactRecheckPresentation(immutableInput);
assert.equal(JSON.stringify(immutableInput), immutableBefore);

console.log("dryWebLifecycle: explicit exact-recheck readiness, clearing, guard, dispatch, and immutability passed");

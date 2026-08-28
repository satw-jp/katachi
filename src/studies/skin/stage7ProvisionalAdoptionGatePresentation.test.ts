import {
  createStage7ProvisionalAdoptionGatePresentation,
  type Stage7ProvisionalAdoptionGateIdentity,
} from "./stage7ProvisionalAdoptionGatePresentation.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const planA = Object.freeze({ id: "plan-a" });
const planB = Object.freeze({ id: "plan-b" });
const resultA = Object.freeze({ id: "result-a" });
const resultB = Object.freeze({ id: "result-b" });

function currentInput(
  planIdentity: object | null = planA,
  resultIdentity: object | null = resultA,
  comparisonStatus: "improved" | "unchanged" | "worse" | null = "improved",
  approval: Stage7ProvisionalAdoptionGateIdentity | null = null,
) {
  return {
    planIdentity,
    resultIdentity,
    planCurrent: planIdentity !== null,
    resultCurrent: resultIdentity !== null,
    comparisonState: "current" as const,
    comparisonCurrent: planIdentity !== null && resultIdentity !== null,
    comparisonStatus,
    approval,
  };
}

{
  const unavailable = createStage7ProvisionalAdoptionGatePresentation(null);
  assert(unavailable.state === "unavailable", "null input unavailable");
  assert(!unavailable.approveEnabled && !unavailable.returnToPendingEnabled, "unavailable actions disabled");
}

for (const status of ["improved", "unchanged", "worse"] as const) {
  const ready = createStage7ProvisionalAdoptionGatePresentation(currentInput(planA, resultA, status));
  assert(ready.state === "ready-for-author-review", `${status} does not auto-approve`);
  assert(ready.approveEnabled && !ready.returnToPendingEnabled, `${status} explicit approval action`);
  assert(ready.comparisonStatus === status, `${status} remains factual`);
}

{
  const approved = createStage7ProvisionalAdoptionGatePresentation(currentInput(
    planA,
    resultA,
    "improved",
    { planIdentity: planA, resultIdentity: resultA },
  ));
  assert(approved.state === "author-approved-for-next-confirmation", "approved state");
  assert(!approved.approveEnabled && approved.returnToPendingEnabled, "approved actions");
  assert(approved.copy.includes("canonical Graphの採用"), "approval is not canonical adoption");
}

{
  const stale = createStage7ProvisionalAdoptionGatePresentation({
    ...currentInput(planB, resultA, "improved", { planIdentity: planA, resultIdentity: resultA }),
    planCurrent: false,
  });
  assert(stale.state === "stale", "plan identity invalidates approval");
  assert(!stale.approveEnabled && !stale.returnToPendingEnabled, "stale actions disabled");
  assert(stale.comparisonStatus === null, "stale hides comparison status");
}

{
  const staleResult = createStage7ProvisionalAdoptionGatePresentation({
    ...currentInput(planA, resultB, "unchanged", { planIdentity: planA, resultIdentity: resultA }),
    resultCurrent: false,
  });
  assert(staleResult.state === "stale", "result identity invalidates approval");
}

{
  const staleAfterResultClear = createStage7ProvisionalAdoptionGatePresentation({
    ...currentInput(null, null, null),
    comparisonState: "stale",
    comparisonCurrent: false,
  });
  assert(staleAfterResultClear.state === "stale", "explicit stale terminal state remains visible after result clear");
  assert(staleAfterResultClear.comparisonStatus === null, "stale-after-clear hides comparison status");
}

{
  const frozenInput = Object.freeze(currentInput(planA, resultA, "worse"));
  const before = JSON.stringify(frozenInput);
  const presentation = createStage7ProvisionalAdoptionGatePresentation(frozenInput);
  assert(JSON.stringify(frozenInput) === before, "input remains immutable");
  assert(Object.isFrozen(presentation), "presentation is immutable");
}

{
  const approved = { planIdentity: planA, resultIdentity: resultA };
  const reviewed = createStage7ProvisionalAdoptionGatePresentation(currentInput(planA, resultA, "unchanged", approved));
  const pending = createStage7ProvisionalAdoptionGatePresentation(currentInput(planA, resultA, "unchanged", null));
  assert(reviewed.state === "author-approved-for-next-confirmation", "reviewed before pending action");
  assert(pending.state === "ready-for-author-review", "reversible pending action");
  assert(!pending.returnToPendingEnabled && pending.approveEnabled, "pending action returns to explicit review");
}

console.log("stage7ProvisionalAdoptionGatePresentation.test.ts: all assertions passed");

// ---------------------------------------------------------------------------
// Pure-function coverage for the A/B partition guided tutorial.
// Run: npm run test:partition (tsx is a direct devDependency; no network needed)
// No test framework (AGENTS.md §5 — same style as partition.test.ts).
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import {
  correctTutorialFlags,
  derivePartitionTutorialStep,
  describePartitionInvalidationStatus,
  describePartitionSelectionLabel,
  derivePartitionViewportFocus,
  deriveTutorialNavState,
  draftMatchesConfirmedPartition,
  getTutorialStepContent,
  hasPartitionDraft,
  normalizeDisplayedStep,
  resolvePartitionSelectionGroup,
  TUTORIAL_TOTAL_STEPS,
  type PartitionTutorialSnapshot,
  type TutorialStepId,
} from "./partitionTutorial.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function base(overrides: Partial<PartitionTutorialSnapshot> = {}): PartitionTutorialSnapshot {
  return {
    patchCount: 10,
    seedPickMode: false,
    seedAId: null,
    seedBId: null,
    draftACount: 0,
    draftBCount: 0,
    unassignedCount: 10,
    confirmed: false,
    workerRunning: false,
    hasResult: false,
    gateOk: false,
    visualReviewed: false,
    manualReviewed: false,
    ...overrides,
  };
}

test("1. recipe未読込またはpatchなし → 準備 (step 1)", () => {
  assert.equal(derivePartitionTutorialStep(base({ patchCount: 0 })), 1);
  assert.equal(derivePartitionTutorialStep(base({ patchCount: 0, seedAId: 1, seedBId: 2, draftACount: 5, draftBCount: 5 })), 1);
});

test("2. A端のみ → B端選択を案内 (step 2)", () => {
  assert.equal(derivePartitionTutorialStep(base({ seedAId: 10, seedBId: null })), 2);
  assert.equal(derivePartitionTutorialStep(base({ seedAId: null, seedBId: 20 })), 2);
  assert.equal(derivePartitionTutorialStep(base({ seedAId: null, seedBId: null, patchCount: 5 })), 2);
});

test("3. A/B両端あり、draftなし → 提案を案内 (step 3)", () => {
  assert.equal(
    derivePartitionTutorialStep(
      base({
        seedAId: 1,
        seedBId: 2,
        draftACount: 0,
        draftBCount: 0,
      }),
    ),
    3,
  );
  // one-sided draft is not a real A/B draft
  assert.equal(
    derivePartitionTutorialStep(
      base({
        seedAId: 1,
        seedBId: 2,
        draftACount: 0,
        draftBCount: 10,
      }),
    ),
    3,
  );
  assert.equal(hasPartitionDraft({ draftACount: 0, draftBCount: 10 }), false);
});

test("4. draftあり → 見た目確認 (step 4)", () => {
  assert.equal(
    derivePartitionTutorialStep(
      base({
        seedAId: 1,
        seedBId: 2,
        draftACount: 5,
        draftBCount: 5,
        unassignedCount: 0,
        visualReviewed: false,
      }),
    ),
    4,
  );
});

test("5. 確定済み → 物理分割を案内 (step 7)", () => {
  assert.equal(
    derivePartitionTutorialStep(
      base({
        seedAId: 1,
        seedBId: 2,
        draftACount: 5,
        draftBCount: 5,
        confirmed: true,
        visualReviewed: true,
        manualReviewed: true,
      }),
    ),
    7,
  );
});

test("6. Worker実行中 → 進捗・キャンセル案内 (step 7)", () => {
  assert.equal(
    derivePartitionTutorialStep(
      base({
        confirmed: true,
        workerRunning: true,
        hasResult: false,
      }),
    ),
    7,
  );
});

test("7. 結果あり、ゲート不合格 → 結果確認に留まる (step 7)", () => {
  assert.equal(
    derivePartitionTutorialStep(
      base({
        confirmed: true,
        hasResult: true,
        gateOk: false,
      }),
    ),
    7,
  );
});

test("8. 結果あり、ゲート合格 → 保存案内 (step 8)", () => {
  assert.equal(
    derivePartitionTutorialStep(
      base({
        confirmed: true,
        hasResult: true,
        gateOk: true,
      }),
    ),
    8,
  );
});

test("author flags: visual/manual advance 4 → 5 → 6", () => {
  const drafted = base({
    seedAId: 1,
    seedBId: 2,
    draftACount: 6,
    draftBCount: 4,
    unassignedCount: 0,
  });
  assert.equal(derivePartitionTutorialStep({ ...drafted, visualReviewed: false, manualReviewed: false }), 4);
  assert.equal(derivePartitionTutorialStep({ ...drafted, visualReviewed: true, manualReviewed: false }), 5);
  assert.equal(derivePartitionTutorialStep({ ...drafted, visualReviewed: true, manualReviewed: true }), 6);
});

test("correctTutorialFlags: clears reviews when draft disappears", () => {
  const cleared = correctTutorialFlags(
    {
      patchCount: 10,
      seedPickMode: false,
      seedAId: 1,
      seedBId: 2,
      draftACount: 0,
      draftBCount: 0,
      unassignedCount: 10,
      confirmed: false,
      workerRunning: false,
      hasResult: false,
      gateOk: false,
    },
    { visualReviewed: true, manualReviewed: true },
  );
  assert.deepEqual(cleared, { visualReviewed: false, manualReviewed: false });
});

test("state wins over stale flags: no patches still step 1", () => {
  assert.equal(
    derivePartitionTutorialStep(
      base({
        patchCount: 0,
        visualReviewed: true,
        manualReviewed: true,
        confirmed: true,
        hasResult: true,
        gateOk: true,
      }),
    ),
    1,
  );
});

// --- draftMatchesConfirmedPartition: draft/confirmed identity, not just
// "something was confirmed" (post-limit-audit-fixes B1) ---------------------

test("draftMatchesConfirmedPartition: same set, different array order → match", () => {
  assert.equal(
    draftMatchesConfirmedPartition([3, 1, 2], [40, 20], { groupA: [1, 2, 3], groupB: [20, 40] }),
    true,
  );
});

test("draftMatchesConfirmedPartition: one patch moved A→B after confirming → mismatch", () => {
  // Confirmed as A=[1,2,3] B=[4,5]; author then moves patch 3 to B.
  assert.equal(
    draftMatchesConfirmedPartition([1, 2], [3, 4, 5], { groupA: [1, 2, 3], groupB: [4, 5] }),
    false,
  );
});

test("draftMatchesConfirmedPartition: A/B wholesale swap → mismatch (not an unordered-pair match)", () => {
  assert.equal(
    draftMatchesConfirmedPartition([4, 5], [1, 2, 3], { groupA: [1, 2, 3], groupB: [4, 5] }),
    false,
  );
});

test("draftMatchesConfirmedPartition: no confirmed partition yet → never a match", () => {
  assert.equal(draftMatchesConfirmedPartition([1, 2], [3, 4], null), false);
});

test("draftMatchesConfirmedPartition: same size but different members → mismatch", () => {
  assert.equal(
    draftMatchesConfirmedPartition([1, 2, 6], [3, 4, 5], { groupA: [1, 2, 3], groupB: [4, 5, 6] }),
    false,
  );
});

// --- draft-edit-after-confirm regression (B1 §162-168 in the audit doc) ----

test("confirm → edit draft → derives step 6, not 7 (build must be blocked)", () => {
  const confirmed = { groupA: [1, 2, 3], groupB: [4, 5] };
  // Right after confirming: draft equals confirmed, flags already reviewed
  // from the pass that got here (steps 4/5 already walked through once).
  const justConfirmed = base({
    seedAId: 1, seedBId: 4, draftACount: 3, draftBCount: 2, unassignedCount: 0,
    visualReviewed: true, manualReviewed: true,
    confirmed: draftMatchesConfirmedPartition([1, 2, 3], [4, 5], confirmed),
  });
  assert.equal(justConfirmed.confirmed, true);
  assert.equal(derivePartitionTutorialStep(justConfirmed), 7);

  // Author moves patch 3 from A to B without re-confirming.
  const editedAfterConfirm = base({
    seedAId: 1, seedBId: 4, draftACount: 2, draftBCount: 3, unassignedCount: 0,
    visualReviewed: true, manualReviewed: true,
    confirmed: draftMatchesConfirmedPartition([1, 2], [3, 4, 5], confirmed),
  });
  assert.equal(editedAfterConfirm.confirmed, false);
  assert.equal(derivePartitionTutorialStep(editedAfterConfirm), 6);
});

test("re-confirm after editing → derives step 7 again (build allowed)", () => {
  const reconfirmed = { groupA: [1, 2], groupB: [3, 4, 5] };
  const snapshot = base({
    seedAId: 1, seedBId: 4, draftACount: 2, draftBCount: 3, unassignedCount: 0,
    visualReviewed: true, manualReviewed: true,
    confirmed: draftMatchesConfirmedPartition([1, 2], [3, 4, 5], reconfirmed),
  });
  assert.equal(snapshot.confirmed, true);
  assert.equal(derivePartitionTutorialStep(snapshot), 7);
});

// --- deriveTutorialNavState: displayedStep vs actualStep (B2) --------------

test("deriveTutorialNavState: following (displayedStep === actualStep) at step 4 offers confirm", () => {
  const nav = deriveTutorialNavState(4, 4, { visualReviewed: false, manualReviewed: false });
  assert.equal(nav.isViewingPast, false);
  assert.equal(nav.advanceMode, "confirm");
  assert.equal(nav.canAdvance, true);
  assert.equal(nav.canPrev, true); // step 4 > 1, so 前へ can still page back to read earlier steps
});

test("deriveTutorialNavState: following at step 4 already reviewed → cannot advance again", () => {
  const nav = deriveTutorialNavState(4, 4, { visualReviewed: true, manualReviewed: false });
  assert.equal(nav.canAdvance, false);
});

test("deriveTutorialNavState: step 1 following → canPrev is false (nothing earlier to read)", () => {
  const nav = deriveTutorialNavState(1, 1, { visualReviewed: false, manualReviewed: false });
  assert.equal(nav.canPrev, false);
});

test("deriveTutorialNavState: browsing back from real step 7 can still page (前へ 実際に動く)", () => {
  const nav = deriveTutorialNavState(7 as TutorialStepId, 6 as TutorialStepId, { visualReviewed: true, manualReviewed: true });
  assert.equal(nav.isViewingPast, true);
  assert.equal(nav.canPrev, true);
  // "次へ" while browsing only turns the page (advanceMode "next"), it must
  // never look like "confirm" even though step 6's own content has no
  // advance control in following mode.
  assert.equal(nav.advanceMode, "next");
  assert.equal(nav.canAdvance, true);
});

test("deriveTutorialNavState: browsing a step 4/5 page while actual step is 7/8 never offers confirm", () => {
  // This is the exact bug shape: reading step 4's page (whose OWN content
  // says advance:"confirm") while the real workflow is already at step 8 --
  // must show "次へ" (view-only), never mutate visualReviewed via this path.
  const nav = deriveTutorialNavState(8 as TutorialStepId, 4 as TutorialStepId, { visualReviewed: true, manualReviewed: true });
  assert.equal(nav.isViewingPast, true);
  assert.equal(nav.advanceMode, "next");
});

test("deriveTutorialNavState: browsing exactly up to actualStep has nothing further to page to", () => {
  const nav = deriveTutorialNavState(3 as TutorialStepId, 3 as TutorialStepId, { visualReviewed: false, manualReviewed: false });
  assert.equal(nav.isViewingPast, false); // displayedStep caught up to actualStep -- following again
});

// --- normalizeDisplayedStep: the real workflow regressing below wherever the
// author was reading must stop pinning to a step it hasn't even reached
// anymore (inflight-draft-fix P1) -----------------------------------------

test("normalizeDisplayedStep: actualStep regressed below the browsed step -> resets to follow (null)", () => {
  // Author was reading Step 6 (前へ from Step 7); reselecting endpoints then
  // drops the real workflow back to Step 2 -- Step 6 no longer exists to browse.
  assert.equal(normalizeDisplayedStep(2 as TutorialStepId, 6 as TutorialStepId), null);
});

test("normalizeDisplayedStep: actualStep still at/above the browsed step -> unchanged (still browsing)", () => {
  assert.equal(normalizeDisplayedStep(7 as TutorialStepId, 6 as TutorialStepId), 6);
});

test("normalizeDisplayedStep: displayedStep already following (null) -> stays null", () => {
  assert.equal(normalizeDisplayedStep(6 as TutorialStepId, null), null);
});

test("normalizeDisplayedStep: displayedStep equal to actualStep -> unchanged, caller resolves to follow", () => {
  // normalizeDisplayedStep only handles the regression case; the separate
  // "caught up" -> null transition is refreshPartitionTutorial()'s own
  // follow-up step, exercised together in the integration case below.
  assert.equal(normalizeDisplayedStep(6 as TutorialStepId, 6 as TutorialStepId), 6);
});

test("normalizeDisplayedStep + deriveTutorialNavState together: the three documented cases", () => {
  // actualStep=2, displayedStep=6 -> displayed Step 2, isViewingPast=false
  {
    const normalized = normalizeDisplayedStep(2 as TutorialStepId, 6 as TutorialStepId);
    const resolved = normalized ?? (2 as TutorialStepId);
    const nav = deriveTutorialNavState(2 as TutorialStepId, resolved, { visualReviewed: false, manualReviewed: false });
    assert.equal(nav.displayedStep, 2);
    assert.equal(nav.isViewingPast, false);
  }
  // actualStep=7, displayedStep=6 -> unchanged, still viewing past
  {
    const normalized = normalizeDisplayedStep(7 as TutorialStepId, 6 as TutorialStepId);
    const resolved = normalized ?? (7 as TutorialStepId);
    const nav = deriveTutorialNavState(7 as TutorialStepId, resolved, { visualReviewed: true, manualReviewed: true });
    assert.equal(nav.displayedStep, 6);
    assert.equal(nav.isViewingPast, true);
  }
  // actualStep=6, displayedStep=6 -> caught up, follow state (isViewingPast=false)
  {
    const normalized = normalizeDisplayedStep(6 as TutorialStepId, 6 as TutorialStepId);
    const resolvedDisplayed = normalized === 6 ? null : normalized; // refreshPartitionTutorial()'s catch-up rule
    const resolved = resolvedDisplayed ?? (6 as TutorialStepId);
    const nav = deriveTutorialNavState(6 as TutorialStepId, resolved, { visualReviewed: true, manualReviewed: true });
    assert.equal(nav.displayedStep, 6);
    assert.equal(nav.isViewingPast, false);
  }
});

// --- describePartitionInvalidationStatus: honest status text when a running
// build or a completed result is discarded by invalidateStalePartitionResult()
// ---------------------------------------------------------------------------

test("describePartitionInvalidationStatus: running Worker killed, draft no longer matches confirmed -> asks to re-confirm", () => {
  const text = describePartitionInvalidationStatus(true, false);
  assert.match(text, /実行中だった分割/);
  assert.match(text, /もう一度確定してください/);
});

test("describePartitionInvalidationStatus: running Worker killed, draft still matches confirmed -> asks to rebuild only", () => {
  const text = describePartitionInvalidationStatus(true, true);
  assert.match(text, /実行中だった分割/);
  assert.match(text, /確定構成は変わっていない/);
  assert.match(text, /もう一度物理分割してください/);
  assert.doesNotMatch(text, /もう一度確定してください/);
});

test("describePartitionInvalidationStatus: completed result discarded, draft no longer matches confirmed -> asks to re-confirm", () => {
  const text = describePartitionInvalidationStatus(false, false);
  assert.match(text, /前回の分割結果/);
  assert.match(text, /もう一度確定してください/);
});

test("describePartitionInvalidationStatus: completed result discarded, draft still matches confirmed -> asks to rebuild only", () => {
  const text = describePartitionInvalidationStatus(false, true);
  assert.match(text, /前回の分割結果/);
  assert.match(text, /確定構成は変わっていない/);
  assert.match(text, /もう一度物理分割してください/);
});

// --- resolvePartitionSelectionGroup / describePartitionSelectionLabel:
// T14 selection visibility (作者Observation 2026-07-20) ---------------------

test("resolvePartitionSelectionGroup: in A set -> \"A\"", () => {
  assert.equal(resolvePartitionSelectionGroup(5, [5, 6], [7, 8]), "A");
});

test("resolvePartitionSelectionGroup: in B set -> \"B\"", () => {
  assert.equal(resolvePartitionSelectionGroup(7, [5, 6], [7, 8]), "B");
});

test("resolvePartitionSelectionGroup: in neither -> \"unassigned\"", () => {
  assert.equal(resolvePartitionSelectionGroup(9, [5, 6], [7, 8]), "unassigned");
});

test("resolvePartitionSelectionGroup: in BOTH sets (invariant violation) -> \"conflict\", not a silent A tie-break", () => {
  assert.equal(resolvePartitionSelectionGroup(5, [5, 6], [5, 8]), "conflict");
});

test("describePartitionSelectionLabel: selected=null -> 未選択 with the click instruction", () => {
  const text = describePartitionSelectionLabel(null);
  assert.match(text, /選択中Patch: なし/);
  assert.match(text, /クリック/);
});

test("describePartitionSelectionLabel: group A -> shows ID and 青", () => {
  assert.equal(describePartitionSelectionLabel({ id: 425, group: "A" }), "選択中Patch: #425 / 現在 A（青）");
});

test("describePartitionSelectionLabel: group B -> shows ID and オレンジ", () => {
  assert.equal(describePartitionSelectionLabel({ id: 469, group: "B" }), "選択中Patch: #469 / 現在 B（オレンジ）");
});

test("describePartitionSelectionLabel: unassigned -> shows ID and 未割当", () => {
  assert.equal(describePartitionSelectionLabel({ id: 500, group: "unassigned" }), "選択中Patch: #500 / 現在 未割当");
});

test("describePartitionSelectionLabel: conflict -> honestly flags the anomaly, never silently picks A or B", () => {
  const text = describePartitionSelectionLabel({ id: 5, group: "conflict" });
  assert.match(text, /#5/);
  assert.match(text, /異常/);
  assert.doesNotMatch(text, /現在 A/);
  assert.doesNotMatch(text, /現在 B/);
});

// --- getTutorialStepContent: T14 short one-liner (instruction §2.5) --------

test("getTutorialStepContent: every step has a non-empty short instruction distinct from the title", () => {
  for (let s = 1; s <= TUTORIAL_TOTAL_STEPS; s++) {
    const content = getTutorialStepContent(s as TutorialStepId);
    assert.ok(content.short.length > 0, `step ${s} has an empty short line`);
    assert.notEqual(content.short, content.title, `step ${s}'s short line just repeats the title`);
  }
});

// --- derivePartitionViewportFocus: T15 selection-final-polish P1
// (viewport chip/frame only inside an actual A/B workflow context) --------

const baseFocusInput = {
  addPatchMode: false,
  seedPickMode: false,
  seedAPicked: false,
  hasPatches: true,
  inPartitionContext: false,
  hasSelection: false,
};

test("derivePartitionViewportFocus: patches exist, no A/B context, unselected -> hidden (not '① coinをクリック' during unrelated work)", () => {
  assert.equal(derivePartitionViewportFocus(baseFocusInput), "hidden");
});

test("derivePartitionViewportFocus: patches exist, A/B draft context, unselected -> no-selection", () => {
  assert.equal(derivePartitionViewportFocus({ ...baseFocusInput, inPartitionContext: true }), "no-selection");
});

test("derivePartitionViewportFocus: patches exist, A/B draft context, selected -> selected", () => {
  assert.equal(
    derivePartitionViewportFocus({ ...baseFocusInput, inPartitionContext: true, hasSelection: true }),
    "selected",
  );
});

test("derivePartitionViewportFocus: seed picking, A not yet picked -> seed-a-wait", () => {
  assert.equal(derivePartitionViewportFocus({ ...baseFocusInput, seedPickMode: true }), "seed-a-wait");
});

test("derivePartitionViewportFocus: seed picking, A already picked -> seed-b-wait", () => {
  assert.equal(
    derivePartitionViewportFocus({ ...baseFocusInput, seedPickMode: true, seedAPicked: true }),
    "seed-b-wait",
  );
});

test("derivePartitionViewportFocus: manual add-patch mode suppresses focus even with full A/B context", () => {
  assert.equal(
    derivePartitionViewportFocus({
      ...baseFocusInput,
      addPatchMode: true,
      seedPickMode: true,
      inPartitionContext: true,
      hasSelection: true,
    }),
    "hidden",
  );
});

test("derivePartitionViewportFocus: no patches at all -> hidden even inside A/B context", () => {
  assert.equal(
    derivePartitionViewportFocus({ ...baseFocusInput, hasPatches: false, inPartitionContext: true }),
    "hidden",
  );
});

console.log(`\n${passed} passed`);
if (process.exitCode) {
  console.error("SOME TESTS FAILED");
} else {
  console.log("ALL TESTS PASSED");
}

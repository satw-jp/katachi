// ---------------------------------------------------------------------------
// A/B partition guided tutorial — pure state derivation only.
//
// Does NOT touch geometry, history, export, or mesh generation. The UI layer
// reads derivePartitionTutorialStep() and paints a compact in-panel card plus
// temporary highlight classes on existing controls.
// ---------------------------------------------------------------------------

export type TutorialStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Minimal snapshot of existing A/B UI state. No geometry payloads. */
export interface PartitionTutorialSnapshot {
  patchCount: number;
  seedPickMode: boolean;
  seedAId: number | null;
  seedBId: number | null;
  draftACount: number;
  draftBCount: number;
  unassignedCount: number;
  /** True when state.partition (confirmPartition) is present. */
  confirmed: boolean;
  workerRunning: boolean;
  hasResult: boolean;
  /** partitionResult.gate.ok — only meaningful when hasResult. */
  gateOk: boolean;
  /**
   * Author explicitly advanced past the visual-check step (Step 4).
   * Pure state cannot auto-pass "見た目確認"; the guide waits for this.
   */
  visualReviewed: boolean;
  /**
   * Author explicitly advanced past the optional manual-fix step (Step 5).
   */
  manualReviewed: boolean;
}

export interface TutorialStepContent {
  id: TutorialStepId;
  title: string;
  /** One-line imperative instruction, always visible without opening the
   * detail disclosure -- 作者方針 2026-07-20 "文字はあまり読まない...今すべき
   * 操作を強調表示が大事". `body` (the old multi-bullet explanation) moves
   * into a collapsed <details> the author opens only if they want it. */
  short: string;
  body: string[];
  /** Existing control target keys to highlight (see ui.ts data-tutorial-target). */
  highlightTargets: string[];
  /**
   * Primary advance action for this step when the author must judge:
   * - "confirm" → show 「確認した」
   * - "next" → show 「次へ」 (rare; most non-author steps advance via state)
   * - "none" → no advance button; wait for real UI action / state change
   */
  advance: "confirm" | "next" | "none";
}

export const TUTORIAL_TOTAL_STEPS = 8 as const;

export const TUTORIAL_STORAGE_KEY = "katachi-skin-partition-tutorial-v1";

export interface TutorialPersistedUi {
  open: boolean;
  visualReviewed: boolean;
  manualReviewed: boolean;
}

export function defaultTutorialPersistedUi(): TutorialPersistedUi {
  return { open: false, visualReviewed: false, manualReviewed: false };
}

/** True when both endpoints are set and a real A/B draft exists (both sides non-empty). */
export function hasPartitionDraft(snapshot: Pick<PartitionTutorialSnapshot, "draftACount" | "draftBCount">): boolean {
  return snapshot.draftACount > 0 && snapshot.draftBCount > 0;
}

function sameIdSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const id of b) if (!set.has(id)) return false;
  return true;
}

/**
 * True when the current draft A/B groups are exactly the last CONFIRMED A/B
 * groups, as sets (member order does not matter). "Confirmed" must mean
 * "this exact configuration was confirmed", not merely "something was
 * confirmed at some point" -- a draft edited after confirming (propose again,
 * move one patch, reselect endpoints) no longer counts as confirmed here,
 * even though the last confirm is still sitting in history untouched.
 *
 * A/B swapped (draft A == confirmed B and vice versa) is intentionally NOT a
 * match: A and B are different physical outputs, not an unordered pair.
 */
export function draftMatchesConfirmedPartition(
  draftGroupA: readonly number[],
  draftGroupB: readonly number[],
  confirmed: { groupA: readonly number[]; groupB: readonly number[] } | null,
): boolean {
  if (!confirmed) return false;
  return sameIdSet(draftGroupA, confirmed.groupA) && sameIdSet(draftGroupB, confirmed.groupB);
}

/**
 * Status text for the moment invalidateStalePartitionResult() discards a
 * running build OR a previously-completed result because the draft changed.
 * Always invalidates unconditionally (see main.ts), but the wording must not
 * lie about what the author needs to do next:
 *
 * - If the edit left the draft matching a DIFFERENT configuration than the
 *   last confirmPartition() (draftMatchesConfirmedPartition === false), the
 *   discarded result no longer corresponds to anything on record -- a fresh
 *   confirm is required before a rebuild is even allowed (buildPartition()
 *   itself gates on this).
 * - If the edit was a no-op relative to the confirmed configuration (e.g. a
 *   redundant "move to the group it's already in" click, or a re-propose
 *   that landed on the same sets), the confirmed history record still
 *   matches -- re-confirming would be busywork; only a rebuild is needed.
 *
 * `subject` distinguishes "an in-flight Worker was killed" from "a completed
 * result was thrown away" since both call this, and the two are genuinely
 * different events worth naming accurately.
 */
export function describePartitionInvalidationStatus(
  hadRunningWorker: boolean,
  stillConfirmedAfterEdit: boolean,
): string {
  const subject = hadRunningWorker ? "実行中だった分割" : "前回の分割結果";
  if (stillConfirmedAfterEdit) {
    return `A/B操作のため、${subject}を破棄しました。確定構成は変わっていないため、もう一度物理分割してください`;
  }
  return `A/B変更のため、${subject}を破棄しました。もう一度確定してください`;
}

/**
 * Derive the guide step from existing A/B state + author review flags.
 *
 * Rules:
 * - Failed / incomplete operations do not advance (state must actually hold).
 * - When saved flags disagree with current state, state wins (caller should
 *   also clear stale flags via correctTutorialFlags()).
 * - Steps 4–5 require explicit author advance; never auto-pass visual check.
 * - Pure: no geometry / history / export mutation.
 */
export function derivePartitionTutorialStep(snapshot: PartitionTutorialSnapshot): TutorialStepId {
  if (snapshot.patchCount <= 0) return 1;

  // Physical build / result take priority once past confirmation.
  if (snapshot.workerRunning) return 7;
  if (snapshot.hasResult) return snapshot.gateOk ? 8 : 7;
  if (snapshot.confirmed) return 7;

  // Endpoint selection (honest about partial state).
  if (snapshot.seedAId === null || snapshot.seedBId === null) return 2;

  if (!hasPartitionDraft(snapshot)) return 3;

  // Author-judged stages — state alone cannot skip these.
  if (!snapshot.visualReviewed) return 4;
  if (!snapshot.manualReviewed) return 5;

  // Draft ready, not yet confirmed into history.
  return 6;
}

/**
 * Clear author-review flags that no longer make sense for the current state
 * (e.g. draft cleared, recipe reloaded without a draft). Returns a new object.
 */
export function correctTutorialFlags(
  snapshot: Omit<PartitionTutorialSnapshot, "visualReviewed" | "manualReviewed">,
  flags: Pick<TutorialPersistedUi, "visualReviewed" | "manualReviewed">,
): Pick<TutorialPersistedUi, "visualReviewed" | "manualReviewed"> {
  let visualReviewed = flags.visualReviewed;
  let manualReviewed = flags.manualReviewed;

  if (snapshot.patchCount <= 0 || snapshot.seedAId === null || snapshot.seedBId === null || !hasPartitionDraft(snapshot)) {
    visualReviewed = false;
    manualReviewed = false;
  } else if (!visualReviewed) {
    // Cannot have reviewed manual fix without visual review.
    manualReviewed = false;
  }

  // Once confirmed / result exists, flags are irrelevant for derivation but
  // leave them alone so reopening the guide mid-flow doesn't thrash storage.
  return { visualReviewed, manualReviewed };
}

/**
 * Navigation state for the guide card, separating "which step is the real
 * workflow at" (`actualStep`, from `derivePartitionTutorialStep` -- never
 * rewound by browsing) from "which step is currently being read"
 * (`displayedStep` -- a page-turning position the author controls with
 * 前へ/最初から読む/現在の工程へ戻る, independent of real progress).
 *
 * Without this split, 前へ/最初から読む had nothing to rewind once the real
 * step reached 7/8 (both are state-driven, not flag-driven), so the buttons
 * fired their callback but the screen never visibly changed.
 */
export interface TutorialNavState {
  displayedStep: TutorialStepId;
  /** True when displayedStep is a past step, not the real workflow position. */
  isViewingPast: boolean;
  canPrev: boolean;
  /** "confirm" only when at the REAL step 4/5 and not yet reviewed -- this is
   * the only situation in which the advance button may mutate a review flag.
   * "next" means the advance button only turns the displayed page forward
   * (browsing a past step, or a future non-author "next" step type) and must
   * never touch visualReviewed/manualReviewed. */
  advanceMode: "confirm" | "next" | "none";
  canAdvance: boolean;
}

/**
 * Clamp a browsed displayedStep back to "follow" (null) when the real
 * workflow has regressed below it -- e.g. the author was reading Step 6
 * (前へ from Step 7), then reselected endpoints and the real workflow fell
 * back to Step 2. Step 6 is no longer even a step the workflow has reached,
 * so it must not keep showing as "a past step being browsed" -- that reading
 * of "past" only makes sense for steps at or below the real position.
 *
 * Only regression (actualStep now below the browsed step) resets; ordinary
 * forward paging within already-reached territory is left alone --
 * deriveTutorialNavState already bounds that at actualStep on its own.
 */
export function normalizeDisplayedStep(
  actualStep: TutorialStepId,
  displayedStep: TutorialStepId | null,
): TutorialStepId | null {
  if (displayedStep === null) return null;
  if (displayedStep > actualStep) return null;
  return displayedStep;
}

export function deriveTutorialNavState(
  actualStep: TutorialStepId,
  displayedStep: TutorialStepId,
  flags: { visualReviewed: boolean; manualReviewed: boolean },
): TutorialNavState {
  const isViewingPast = displayedStep !== actualStep;
  const canPrev = displayedStep > 1;
  if (isViewingPast) {
    // Browsing: reading a step other than where the real workflow is. The
    // page can only turn further within already-visited territory (up to
    // actualStep) or back toward 1 -- never ahead of real progress.
    return {
      displayedStep, isViewingPast, canPrev,
      advanceMode: displayedStep < actualStep ? "next" : "none",
      canAdvance: displayedStep < actualStep,
    };
  }
  const content = getTutorialStepContent(actualStep);
  if (content.advance === "confirm") {
    const reviewed = actualStep === 4 ? flags.visualReviewed : actualStep === 5 ? flags.manualReviewed : true;
    return { displayedStep, isViewingPast, canPrev, advanceMode: "confirm", canAdvance: !reviewed };
  }
  return { displayedStep, isViewingPast, canPrev, advanceMode: content.advance, canAdvance: false };
}

export function getTutorialStepContent(step: TutorialStepId): TutorialStepContent {
  switch (step) {
    case 1:
      return {
        id: 1,
        title: "準備 — skin recipe を読み込む",
        short: "skin recipe を読み込んでください",
        body: [
          "このガイドは形や分割結果を変えません。既存のA/B工程を順番に案内するだけです。",
          "「skin 履歴を読み込む」から recipe を開いてください（CoinSRF なら 141 patches が目安。141 は動作条件ではありません）。",
          "パッチが1個以上ある状態になれば次の段階へ進みます。",
        ],
        highlightTargets: ["import-recipe"],
        advance: "none",
      };
    case 2:
      return {
        id: 2,
        title: "A端とB端を選ぶ",
        short: "A端をクリック → 次に反対側のB端をクリック",
        body: [
          "「A端・B端を選び直す」を押し、A側にしたい端の coin を1個クリック → 反対側のB端を1個クリックします。",
          "選択中は同じボタンが「両端選択を中止（A端→B端）」になり、もう一度押すと中止できます。",
          "片方だけ選んだ状態もそのまま表示されます。両端が揃うと次へ進めます。",
        ],
        highlightTargets: ["seed-pick"],
        advance: "none",
      };
    case 3:
      return {
        id: 3,
        title: "約半分の候補を作る",
        short: "「両端から約半分のA/B候補を提案」を押す",
        body: [
          "「両端から約半分のA/B候補を提案」を押します。",
          "両端からの距離と連結性を使った初期案です。見た目の正解を保証するものではありません。",
          "提案後は A/B 件数と未割当数が表示されます。",
        ],
        highlightTargets: ["propose"],
        advance: "none",
      };
    case 4:
      return {
        id: 4,
        title: "全体を見る（青=A / オレンジ=B）",
        short: "A+B / Aのみ / Bのみを切り替えて形を見る",
        body: [
          "色分け: 青 = A、オレンジ = B（色だけに頼らず、凡例の文字でも確認）。",
          "プレビューの「A+B」「Aのみ」「Bのみ」を順に切り替えて全体を見てください。",
          "確認の観点: (1) A/B が極端な一欠片対多数になっていないか (2) それぞれがおおむね一塊に見えるか (3) 離れて浮く coin や細い首だけでつながる coin がないか。",
          "この段階は自動合格しません。見た目に納得したら「確認した」で進みます。",
        ],
        highlightTargets: ["preview-filter", "legend"],
        advance: "confirm",
      };
    case 5:
      return {
        id: 5,
        title: "必要なら手動修正",
        short: "気になるcoinをクリックしてAかBへ移す",
        body: [
          "気になる coin をクリックし、「選択中のパッチをAへ / Bへ」で移せます。ガイドが自動で coin を動かすことはありません。",
          "選択中の Patch ID・現在グループ・隣接数は、既存の選択情報表示で確認できます。",
          "修正不要ならそのまま「確認した」で次へ進めます。",
        ],
        // T14: also highlight the advance button itself -- after fixing a
        // patch, "確認した" is genuinely the next real action, and 作者方針
        // 2026-07-20 wants the NEXT operation emphasized, not just the one
        // just taken (instruction §2.3 "A/Bを変更した直後...tutorialがStep
        // 5なら、次の既存操作である確認したを強調する").
        highlightTargets: ["assign-ab", "confirm-review"],
        advance: "confirm",
      };
    case 6:
      return {
        id: 6,
        title: "分割案を確定",
        short: "「このA/B構成を確定」を押す",
        body: [
          "「このA/B構成を確定（履歴へ記録）」を押します。",
          "確定は履歴へ記録する段階で、STL はまだ作られません。",
          "確定済みかどうかは、その後のステータス表示で分かります。",
        ],
        highlightTargets: ["confirm"],
        advance: "none",
      };
    case 7:
      return {
        id: 7,
        title: "物理分割して結果を読む",
        short: "物理分割を開始して結果を待つ",
        body: [
          "「確定したA/Bを物理分割してメッシュ化」を作者自身が押してください（自動実行しません）。",
          "CoinSRF・解像度96では過去実測で約30〜50秒かかることがあります。実行中も画面操作でき、キャンセルもできます。",
          "完了後: 元形状/A/Bの総合がOKか、A/Bの連結成分が各1か、体積差と meshFidelity が許容内かを読んでください。",
          "数値がゼロでも、95%上限やトポロジーが NG なら合格ではありません。ゲート不合格のときはこの段階に留まります。",
        ],
        highlightTargets: ["build", "cancel-build"],
        advance: "none",
      };
    case 8:
      return {
        id: 8,
        title: "保存（通常書き出し）",
        short: "ゲート合格時に「両方書き出す」で保存",
        body: [
          "ゲート合格時だけ「両方書き出す」などの通常書き出しが使えます。A STL・B STL・recipe・provenance が生成されます。",
          "「検証用・非合格」は診断用であり、そのまま印刷採用するためのものではありません。",
          "このガイドは印刷可能・安全・サポート不要を断定しません。最終判断は作者が行います。",
        ],
        highlightTargets: ["export-normal", "export-verify"],
        advance: "none",
      };
  }
}

export function loadTutorialPersistedUi(): TutorialPersistedUi {
  try {
    const raw = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) return defaultTutorialPersistedUi();
    const parsed = JSON.parse(raw) as Partial<TutorialPersistedUi>;
    return {
      open: Boolean(parsed.open),
      visualReviewed: Boolean(parsed.visualReviewed),
      manualReviewed: Boolean(parsed.manualReviewed),
    };
  } catch {
    return defaultTutorialPersistedUi();
  }
}

export function saveTutorialPersistedUi(ui: TutorialPersistedUi): void {
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(ui));
  } catch {
    // private mode / quota — guide still works in-session without persistence
  }
}

// ---------------------------------------------------------------------------
// T14 selection visibility (作者Observation 2026-07-20 "選択してA/Bに変更
// するときに選択しているものの表示を変えないと選択できているのかわからない").
// Pure derivation for the always-visible one-line "選択中Patch: ..." display
// next to the A/B assign buttons -- see main.ts's resolvePartitionSelectionGroup
// call site and ui.ts's setPartitionSelectedPatch.
// ---------------------------------------------------------------------------

export type PartitionSelectionGroup = "A" | "B" | "unassigned" | "conflict";

/**
 * Which draft group the selected patch is currently in. "conflict" is not a
 * silent A-wins tie-break -- it surfaces an invariant violation (a patch ID
 * recorded in BOTH draft sets at once) honestly instead of hiding it, per
 * the instruction's explicit "黙ってどちらかへ寄せず異常状態を明示する".
 * main.ts's actual assignment paths always delete from both sets before
 * adding to one, so this should never be reachable in practice; it exists
 * as a defensive, visible fallback rather than an assumed guarantee.
 */
export function resolvePartitionSelectionGroup(
  selectedPatchId: number,
  draftGroupA: readonly number[],
  draftGroupB: readonly number[],
): PartitionSelectionGroup {
  const inA = draftGroupA.includes(selectedPatchId);
  const inB = draftGroupB.includes(selectedPatchId);
  if (inA && inB) return "conflict";
  if (inA) return "A";
  if (inB) return "B";
  return "unassigned";
}

export interface PartitionSelectionInfo {
  id: number;
  group: PartitionSelectionGroup;
}

/** One-line, always-visible label -- instruction §2.2's four example states
 * plus the "conflict" case §4 asks the tests to exercise. */
export function describePartitionSelectionLabel(selected: PartitionSelectionInfo | null): string {
  if (!selected) return "選択中Patch: なし — 3D上のcoinをクリックしてください";
  switch (selected.group) {
    case "A":
      return `選択中Patch: #${selected.id} / 現在 A（青）`;
    case "B":
      return `選択中Patch: #${selected.id} / 現在 B（オレンジ）`;
    case "unassigned":
      return `選択中Patch: #${selected.id} / 現在 未割当`;
    case "conflict":
      return `選択中Patch: #${selected.id} / 異常: A/B双方に登録されています`;
  }
}

// ---------------------------------------------------------------------------
// T15 selection-visibility final polish (selection-final-polish round,
// 2026-07-20 P1): the viewport chip/frame/A-B-row emphasis built in T14
// (見た目上のoperation focus) used to show for ANY patch selection, even
// outside the A/B partition workflow (plain patch inspection, delete,
// unrelated mesh work) -- making A/B assignment look like "the" primary
// action even when the author isn't doing A/B work at all. This function
// takes the "am I even in an A/B context" decision as an explicit input
// (inPartitionContext) rather than deciding it itself, so main.ts can
// compute that from tutorial/draft/confirmed-partition state WITHOUT this
// function reaching back into the UI layer (no circular refresh calls).
// ---------------------------------------------------------------------------

export type PartitionViewportFocus = "hidden" | "no-selection" | "selected" | "seed-a-wait" | "seed-b-wait";

export interface PartitionViewportFocusInput {
  /** Manual-add-patch mode has its own crosshair cursor and workflow --
   * A/B focus chrome must never compete with it, even mid A/B-workflow. */
  addPatchMode: boolean;
  seedPickMode: boolean;
  /** True once the A endpoint has been picked (only meaningful while
   * seedPickMode is true -- decides A-wait vs B-wait). */
  seedAPicked: boolean;
  hasPatches: boolean;
  /** True when the author is actually doing A/B work: seed-picking, an
   * A/B draft exists, a partition is already confirmed, or the guide is
   * open and on the one step whose entire point is "select a patch and
   * move it" (Step 5). False for ordinary Pack/delete/mesh-inspect work. */
  inPartitionContext: boolean;
  hasSelection: boolean;
}

export function derivePartitionViewportFocus(input: PartitionViewportFocusInput): PartitionViewportFocus {
  if (input.addPatchMode) return "hidden";
  if (input.seedPickMode) return input.seedAPicked ? "seed-b-wait" : "seed-a-wait";
  if (!input.hasPatches) return "hidden";
  if (!input.inPartitionContext) return "hidden";
  return input.hasSelection ? "selected" : "no-selection";
}

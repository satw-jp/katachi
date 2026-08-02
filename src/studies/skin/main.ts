// ---------------------------------------------------------------------------
// S-skin (T10) — entry point. Wires host field (shared with S1) + skin field
// (this Study's patch packing + mode-dependent composite SDF) + history +
// renderer + UI. See README.md for Question/Setup/Observation/Hypothesis/Next.
//
// Interaction scope (仮決め, same reasoning as pack/main.ts): NO dragging of
// patches. Patches are placed by the greedy packer, or by a single click
// (manual add), or removed by click-select + Delete.
// ---------------------------------------------------------------------------

import "./style.css";
import { eventTargetsViewport, ndcFromPointer } from "../../lib/input.ts";
import { startFrameLoop } from "../../lib/loop.ts";
// R2 昇格 (2026-07-26): このファイルにあった private な sha256Hex を Library へ移した。
// 呼び出し順・保存順・provenance へ入る hash は変えていない。
import { sha256Hex } from "../../lib/hash.ts";
import manifest from "./manifest.json";
import { DEFAULT_FIELD_PARAMS } from "../cloud-sculpt/field.ts";
import { computeSamplingBounds } from "../cloud-sculpt/meshExport.ts";
import type { PartitionSelection, SkinHistoryEntry } from "./history.ts";
import {
  createEmptyState,
  loadHostFromS1Recipe,
  parseRecipe,
  record,
  replay,
  serializeRecipe,
} from "./history.ts";
import {
  DEFAULT_SKIN_PARAMS,
  buildPatchAdjacency,
  estimateCoverage,
  estimateMortar,
  estimatePatchComponents,
  freshPatchId,
  generateShapePoints,
  packPatchesGreedy,
  projectToSurface,
  proposeGroupsBetweenEndpoints,
  proposeGroupsFromSeeds,
} from "./field.ts";
import type { Patch, PackPatchesResult, PatchAdjacencyEdge } from "./field.ts";
import { estimateRingLinking, findDeepPatchOverlaps } from "./linking.ts";
import { buildSkinMesh, downloadSkinMeshBundle, makeSkinExportBaseName, meshSummary } from "./meshExport.ts";
import type { PartitionResult } from "./partition.ts";
import type { PartitionBuildRequest, PartitionWorkerMessage } from "./partitionWorkerProtocol.ts";
import { encodeBinaryStl } from "../cloud-sculpt/meshExport.ts";
import type { SkinViewMode } from "./renderer.ts";
import { SkinRenderer } from "./renderer.ts";
import { raymarchComposite, raymarchHost } from "./picking.ts";
import { HOST_MAX_BALLS, PATCH_MAX_COUNT, PATCH_MAX_POINTS } from "./shaders.ts";
import type { MeshUiOptions } from "./ui.ts";
import { buildUi } from "./ui.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import {
  correctTutorialFlags,
  derivePartitionTutorialStep,
  describePartitionInvalidationStatus,
  derivePartitionViewportFocus,
  deriveTutorialNavState,
  draftMatchesConfirmedPartition,
  loadTutorialPersistedUi,
  normalizeDisplayedStep,
  resolvePartitionSelectionGroup,
  saveTutorialPersistedUi,
  type PartitionTutorialSnapshot,
  type TutorialPersistedUi,
  type TutorialStepId,
} from "./partitionTutorial.ts";

const app = document.getElementById("app")!;
const viewport = document.createElement("div");
viewport.id = "viewport";
app.appendChild(viewport);

// T14 selection visibility (作者Observation 2026-07-20): a floating chip
// naming "the next thing to do", overlaid directly on the viewport instead
// of relying on side-panel text the author said they don't read closely.
// See updateOperationFocus().
const viewportChip = document.createElement("div");
viewportChip.className = "viewport-chip";
viewportChip.hidden = true;
viewport.appendChild(viewportChip);

// --- State -------------------------------------------------------------
let history: SkinHistoryEntry[] = [];
let state = createEmptyState();
let selectedPatchId: number | null = null;
let addPatchMode = false;
let manualRadius = DEFAULT_SKIN_PARAMS.maxR * 0.5;
let lastPackResult: PackPatchesResult | null = null;
// T12: three-way view toggle (レイマーチ / ビーズ / 全体メッシュ), replacing
// T11's boolean mesh-overlay flag. See afterMutation() for the auto-switch
// rule (raymarch -> beads once the point count exceeds the shader's
// PATCH_MAX_POINTS uniform budget -- "黙って先頭だけ描くのを廃止", T12 §2).
let viewMode: SkinViewMode = "raymarch";

// --- T13 coin由来A/B分割 state ------------------------------------------
let seedPickMode = false;
const seedPatchIds = new Set<number>();
let seedAId: number | null = null;
let seedBId: number | null = null;
let draftGroupA = new Set<number>();
let draftGroupB = new Set<number>();
let lastAdjacencyEdges: PatchAdjacencyEdge[] = [];
let partitionResult: PartitionResult | null = null;
let activePartitionWorker: Worker | null = null;
let partitionRequestId = 0;
// Bumped whenever the confirmed partition or the underlying patch set
// changes -- any in-flight worker result tagged with a stale generation is
// discarded on arrival (audit fix: "patch/historyが変わったら古い結果を採用
// しない").
let partitionGeneration = 0;
// SHA-256 of the exact recipe TEXT last imported via "skin 履歴を読み込む",
// so provenance can cite which input produced a given A/B split. Null until
// an import happens (a freshly-grown, never-imported session has no single
// "input recipe" to cite).
let importedRecipeSha256: string | null = null;
let importedRecipeFilename: string | null = null;

// Optional A/B guide open/author-review flags (localStorage only — never
// mixed into recipe/history). Geometry and partition state are untouched.
let tutorialUi: TutorialPersistedUi = loadTutorialPersistedUi();
// Which guide step is currently being READ, separate from the real workflow
// position (derivePartitionTutorialStep). Session-only by design (not
// persisted): null means "follow the real step", a number means the author
// is paging back through past steps with 前へ/最初から読む. See
// deriveTutorialNavState in partitionTutorial.ts for how this is reconciled.
let tutorialDisplayedStep: TutorialStepId | null = null;

const skinRenderer = new SkinRenderer(viewport);

// Seed the initial host so the app opens with something to look at (same
// default grow S1/pack open with).
record(history, state, "growHost", { params: { ...DEFAULT_FIELD_PARAMS } });

function regrowHost(): void {
  record(history, state, "growHost", { params: { ...state.hostParams } });
  selectedPatchId = null;
  afterMutation();
}

// --- UI ------------------------------------------------------------------
const ui = buildUi(app, state.hostParams, state.skinParams, state.mode, manifest.version, manifest.updatedAt, {
  onHostParamChange: (key, value) => {
    record(history, state, "setHostParam", { key, value });
    if (key !== "k") {
      regrowHost();
      return;
    }
    afterMutation();
  },
  onGrowHost: () => regrowHost(),
  onRerollHost: () => {
    const seed = Math.random().toString(36).slice(2, 8);
    record(history, state, "growHost", { params: { ...state.hostParams, seed } });
    selectedPatchId = null;
    ui.syncHostParams(state.hostParams);
    afterMutation();
  },
  onImportS1File: (file) => importS1Recipe(file),
  onSkinParamChange: (key, value) => {
    record(history, state, "setSkinParam", { key, value });
    if (key === "patchShape") ui.setPatchShape(state.skinParams.patchShape);
    // T14 (instruction §3.2, extended to the pre-existing thickness/roundK
    // per §3.2's "共通関数化の方が安全で最小なら揃える"): thickness/roundK/
    // coinBulge are all read LIVE by compositeSdf for EVERY already-placed
    // patch (unlike minR/maxR/irregularity/gap/attempts/patchShape/ring-
    // specific knobs, which only affect patches created by a FUTURE
    // "詰める" -- existing patches keep whatever shape they were packed
    // with). A confirmed A/B result/build was computed from the field as it
    // was at that moment, so changing any of these three stales it exactly
    // the same way a draft edit does. Patch identity/positions and the
    // confirmed A/B GROUPING itself are untouched -- only the physical
    // result/Worker/export/metrics are invalidated, so a re-confirm is
    // never required, only a rebuild.
    if (key === "thickness" || key === "roundK" || key === "coinBulge") {
      invalidateStaleResultForShapeParamChange();
    }
    afterMutation({ skipGauges: true });
  },
  onSetViewMode: (mode) => setViewMode(mode),
  onPackPatches: () => {
    const result = packPatchesGreedy(state.host, state.hostParams.k, state.patches, state.skinParams);
    lastPackResult = result;
    record(history, state, "packPatches", { patches: result.patches });
    afterMutation();
  },
  onClearPatches: () => {
    record(history, state, "clearPatches", {});
    selectedPatchId = null;
    lastPackResult = null;
    afterMutation();
  },
  onClearAll: () => {
    record(history, state, "clearAll", {});
    selectedPatchId = null;
    lastPackResult = null;
    afterMutation();
  },
  onSetMode: (mode) => {
    record(history, state, "setMode", { mode });
    ui.setMode(state.mode);
    render();
  },
  onToggleAddPatchMode: (active) => {
    addPatchMode = active;
    viewport.classList.toggle("add-patch-mode", active);
    ui.setAddPatchModeActive(active);
    updateOperationFocus(); // add-patch mode suppresses the A/B focus chip/frame
  },
  onManualRadiusChange: (r) => {
    manualRadius = r;
  },
  onDeleteSelectedPatch: () => deleteSelectedPatch(),
  onExport: () => exportHistory(),
  onImportFile: (file) => importHistory(file),
  onMeshInspect: (options) => inspectMesh(options),
  onMeshExport: (options) => exportMesh(options),
  onToggleSeedPickMode: (active) => {
    seedPickMode = active;
    viewport.classList.toggle("seed-pick-mode", active);
    if (active) {
      // Starting endpoint selection always means a fresh A -> B sequence.
      // This removes the previous ambiguous state where clicking with two
      // endpoints already present silently replaced only B.
      seedAId = null;
      seedBId = null;
      seedPatchIds.clear();
      draftGroupA = new Set();
      draftGroupB = new Set();
      invalidateStalePartitionResult();
      refreshPartitionDraft();
    } else {
      // "両端選択を中止": this callback only ever fires here while the
      // selection is INCOMPLETE -- handleClick's seed-pick branch flips
      // seedPickMode to false itself (bypassing this callback) the instant
      // both endpoints are picked, so a manual "中止" always means
      // discarding a half-picked (or empty) selection, never a completed
      // pair. Must fully discard seedAId/seedBId and their badges, not
      // just hide the viewport chrome while leaving a half-set A endpoint
      // behind (selection-final-polish P0 -- "中止したのかAだけ確定した
      // のか視覚で判別できない" problem).
      discardEndpointSelection();
    }
  },
  onProposeGroups: () => {
    if (seedAId === null || seedBId === null) {
      alert("A端とB端を1個ずつ選んでください（1クリック目=A端、2クリック目=B端）");
      return;
    }
    lastAdjacencyEdges = buildPatchAdjacency(state.patches, state.skinParams.roundK);
    const proposal = proposeGroupsBetweenEndpoints(state.patches, lastAdjacencyEdges, seedAId, seedBId);
    draftGroupA = new Set(proposal.groupA);
    draftGroupB = new Set(proposal.groupB);
    invalidateStalePartitionResult();
    refreshPartitionDraft();
  },
  onAssignSelectedPatchToGroup: (group) => {
    if (selectedPatchId === null) {
      alert("A/Bへ割り当てるパッチをクリックで選択してください");
      return;
    }
    ensureDraftInitialized();
    draftGroupA.delete(selectedPatchId);
    draftGroupB.delete(selectedPatchId);
    (group === "A" ? draftGroupA : draftGroupB).add(selectedPatchId);
    invalidateStalePartitionResult();
    refreshPartitionDraft();
  },
  onClearSeeds: () => {
    // Shared with onToggleSeedPickMode(false)'s "中止" path -- both discard
    // whatever endpoint/draft state exists and refresh every dependent
    // display the same way (selection-final-polish P0).
    discardEndpointSelection();
    ui.setPartitionStatus("未分割");
  },
  onConfirmPartition: () => confirmPartition(),
  onBuildPartition: () => buildPartition(),
  onCancelPartitionBuild: () => cancelPartitionBuild(),
  onExportPartition: (parts) => void exportPartition(parts, false),
  onExportPartitionVerification: (parts) => void exportPartition(parts, true),
  onSetPartitionPreviewFilter: (filter) => {
    skinRenderer.setBeadGroupFilter(filter);
    render();
  },
  onTutorialOpen: () => tutorialOpen(),
  onTutorialClose: () => tutorialClose(),
  onTutorialPrev: () => tutorialPrev(),
  onTutorialAdvance: () => tutorialAdvance(),
  onTutorialRestart: () => tutorialRestart(),
  onTutorialReturnToCurrent: () => tutorialReturnToCurrent(),
});
ui.setMode(state.mode);
skinRenderer.resize();
afterMutation();
refreshPartitionTutorial();

// --- Pointer interaction ---------------------------------------------------
// Click (no drag) on a patch -> select it (toggle). Click on host skin while
// "add patch" mode is active -> place a manual patch there. Same click/orbit
// disambiguation pattern as pack/cloud-sculpt.

let pointerDownPos: { x: number; y: number } | null = null;
const DRAG_THRESHOLD = 4;

viewport.addEventListener("pointerdown", (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});

window.addEventListener("pointerup", (e) => {
  if (!pointerDownPos) return;
  const dx = e.clientX - pointerDownPos.x;
  const dy = e.clientY - pointerDownPos.y;
  pointerDownPos = null;
  if (Math.hypot(dx, dy) > DRAG_THRESHOLD) return; // was an orbit drag, not a click
  if (!eventTargetsViewport(e, viewport)) return;
  handleClick(e);
});

function handleClick(e: PointerEvent): void {
  const { x, y } = ndcFromPointer(e, viewport);
  const ray = skinRenderer.screenToRay(x, y);

  if (addPatchMode) {
    const hit = raymarchHost(state.host, state.hostParams.k, ray.origin, ray.dir);
    if (!hit) return;
    const proj = projectToSurface(state.host, state.hostParams.k, hit.point.x, hit.point.y, hit.point.z);
    const anchor = proj ?? { x: hit.point.x, y: hit.point.y, z: hit.point.z, nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z };
    // Manual patches use the currently selected shape's generator (T11 §1 --
    // "手動追加・削除まで" is in scope for all three shapes, unlike dragging,
    // which stays out of scope). Like the greedy packer's anchor step, the
    // radius does NOT honor `gap` against other patches here (same
    // documented simplification T10 made for manual coin add) -- only the
    // shape's own internal geometry (ring node count, hole ratio, tube
    // radius, wobble) comes from the live skinParams.
    const patchId = freshPatchId();
    const rng = makeRng(hashSeed(`${state.skinParams.seed}-manual-${patchId}`));
    const points = generateShapePoints(
      state.skinParams.patchShape,
      state.host,
      state.hostParams.k,
      anchor,
      manualRadius,
      state.skinParams,
      rng,
      patchId,
      state.patches,
    );
    if (points.length === 0) return;
    const patch: Patch = { id: patchId, shape: state.skinParams.patchShape, points };
    record(history, state, "addPatch", { patch });
    selectedPatchId = patch.id;
    afterMutation();
    return;
  }

  if (seedPickMode) {
    const hit = raymarchComposite(
      state.mode, state.host, state.hostParams.k, state.skinParams.thickness,
      state.patches, state.skinParams.roundK, ray.origin, ray.dir, state.skinParams.coinBulge,
    );
    if (hit && hit.patchId !== null) {
      if (hit.patchId === seedAId) seedAId = null;
      else if (hit.patchId === seedBId) seedBId = null;
      else if (seedAId === null) seedAId = hit.patchId;
      else seedBId = hit.patchId;
      seedPatchIds.clear();
      if (seedAId !== null) seedPatchIds.add(seedAId);
      if (seedBId !== null) seedPatchIds.add(seedBId);
      if (seedAId !== null && seedBId !== null) {
        seedPickMode = false;
        viewport.classList.remove("seed-pick-mode");
        ui.setSeedPickModeActive(false);
      }
      refreshPartitionDraft();
    }
    return;
  }

  const hit = raymarchComposite(
    state.mode,
    state.host,
    state.hostParams.k,
    state.skinParams.thickness,
    state.patches,
    state.skinParams.roundK,
    ray.origin,
    ray.dir,
    state.skinParams.coinBulge,
  );
  if (hit && hit.patchId !== null) {
    selectedPatchId = hit.patchId === selectedPatchId ? null : hit.patchId;
  } else {
    selectedPatchId = null;
  }
  // Cheap re-color only (no rebuild) -- keeps the bead view's selection in
  // sync even though this path deliberately skips the full afterMutation()
  // (picking doesn't change host/patches, same reasoning as pack/main.ts).
  skinRenderer.updateBeadSelection(selectedPatchId);
  updateSelectionLabel();
  render();
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    if (document.activeElement?.tagName === "INPUT") return; // don't eat text-field edits
    deleteSelectedPatch();
  }
});

function deleteSelectedPatch(): void {
  if (selectedPatchId === null) return;
  record(history, state, "removePatch", { id: selectedPatchId });
  selectedPatchId = null;
  afterMutation();
}

function updateSelectionLabel(): void {
  const p = selectedPatchId === null ? null : state.patches.find((p) => p.id === selectedPatchId) ?? null;
  // T12: these are raymarch-only limits (GLSL uniform-array budgets --
  // shaders.ts's HOST_MAX_BALLS/PATCH_MAX_COUNT/PATCH_MAX_POINTS). Beads and
  // the full-mesh view have no such cap, so showing this warning there would
  // be dishonest (AGENTS §6) -- it would describe a limitation that view
  // doesn't actually have.
  const isRaymarch = viewMode === "raymarch";
  const hostCap =
    isRaymarch && state.host.length > HOST_MAX_BALLS
      ? ` ⚠ 画面はホスト最初の${HOST_MAX_BALLS}球のみ表示（全${state.host.length}球はSTL/検査には含まれる）`
      : "";
  const totalPoints = state.patches.reduce((s, pp) => s + pp.points.length, 0);
  const patchCap =
    isRaymarch && state.patches.length > PATCH_MAX_COUNT
      ? ` ⚠ 画面はパッチ最初の${PATCH_MAX_COUNT}個のみ表示（全${state.patches.length}個はSTL/検査には含まれる）`
      : "";
  // T11 §環境の注意: 立体リングは球数が嵩む (each ring has ringNodeCount
  // nodes vs. a coin's 4-9 sub-points) -- shaders.ts's uniform-array budget
  // (PATCH_MAX_POINTS) is a real ceiling on what the RAYMARCH VIEWPORT can
  // show, so report it honestly rather than silently truncating. T12: only
  // shown in raymarch mode -- beads mode is exactly the escape hatch this
  // limit motivated (see ui.ts's renderViewMode "beads" caption).
  const pointCap =
    isRaymarch && totalPoints > PATCH_MAX_POINTS
      ? ` ⚠ 画面は点群の先頭${PATCH_MAX_POINTS}個のみ表示（全${totalPoints}点はSTL/検査には含まれる。「ビーズ」表示に切り替えると全量が見えます）`
      : "";
  let partitionInfo = "";
  if (p) {
    // T13 audit fix (instruction §2 "UI情報"): ID/shape/group/seed/neighbor
    // IDs/degree/min clearance for the selected patch. Adjacency is
    // recomputed fresh (not from the possibly-stale lastAdjacencyEdges left
    // over from the last "提案" click) so this always reflects the CURRENT
    // patch set -- cheap even at CoinSRF scale (141 patches, O(n^2) pairs
    // each O(points^2), well under a frame budget).
    const edges = buildPatchAdjacency(state.patches, state.skinParams.roundK);
    const neighborEdges = edges.filter((e) => e.aId === p.id || e.bId === p.id);
    const neighborIds = neighborEdges.map((e) => (e.aId === p.id ? e.bId : e.aId));
    const minClearance = neighborEdges.length ? Math.min(...neighborEdges.map((e) => e.distance)) : null;
    const group = draftGroupA.has(p.id) ? "A" : draftGroupB.has(p.id) ? "B" : "未割当";
    const seedText = p.id === seedAId ? "・A端" : p.id === seedBId ? "・B端" : "";
    partitionInfo =
      ` / 群=${group}${seedText} / 隣接${neighborEdges.length}個` +
      (neighborIds.length ? ` (ID ${neighborIds.join(",")})` : "") +
      (minClearance === null ? "" : ` / 最小clearance ${minClearance.toFixed(4)}`);
  }
  ui.setSelectionInfo(
    (p ? `選択中: パッチ #${p.id} (${p.shape}・点${p.points.length}個)${partitionInfo}` : "選択なし") +
      hostCap + patchCap + pointCap,
  );
  ui.setCounts(state.host.length, state.patches.length);
  updateOperationFocus();
}

// --- T14 selection visibility (作者Observation 2026-07-20 "選択してA/Bに
// 変更するときに選択しているものの表示を変えないと選択できているのかわから
// ない") -----------------------------------------------------------------

/** 優先順位: 端点選択モード（明示的に開始された操作）> A/B操作文脈での通常
 * Patch選択 > 何もない（パッチが無い、手動追加モード中、またはA/B操作を
 * していない通常操作中は何も強調しない）。
 *
 * inPartitionContext はここでは決めず main.ts 側の呼び出し元で導出する
 * （derivePartitionViewportFocus の doc comment 参照 -- UI更新への循環
 * 呼出しを作らないため、この関数自体はUIを一切読み書きしない）。 */
function computeViewportFocus(): ReturnType<typeof derivePartitionViewportFocus> {
  const inPartitionContext =
    seedPickMode ||
    draftGroupA.size + draftGroupB.size > 0 ||
    state.partition !== null ||
    (tutorialUi.open && derivePartitionTutorialStep(buildTutorialSnapshot()) === 5);
  return derivePartitionViewportFocus({
    addPatchMode,
    seedPickMode,
    seedAPicked: seedAId !== null,
    hasPatches: state.patches.length > 0,
    inPartitionContext,
    hasSelection: selectedPatchId !== null,
  });
}

/** Viewport chip/frame naming "the next thing to do" (instruction §2.3/2.4),
 * plus the A/B panel's always-visible selection line + button enable state
 * + row emphasis (§2.2/2.3). Cheap DOM-only work -- safe to call after every
 * relevant mutation rather than threading a dedicated call through each one. */
function updateOperationFocus(): void {
  const focus = computeViewportFocus();
  viewport.classList.remove("focus-wait", "focus-seed-a", "focus-seed-b");
  switch (focus) {
    case "hidden":
      viewportChip.hidden = true;
      break;
    case "no-selection":
      viewport.classList.add("focus-wait");
      viewportChip.hidden = false;
      viewportChip.className = "viewport-chip chip-wait";
      viewportChip.textContent = "① coinをクリック";
      break;
    case "selected":
      // Frame intentionally NOT re-added here -- instruction §2.3
      // "viewportの強調枠を解除する" once a patch is selected; the chip
      // stays (repurposed) and the A/B row takes over as the primary cue.
      viewportChip.hidden = false;
      viewportChip.className = "viewport-chip chip-selected";
      viewportChip.textContent = "② AかBを押す";
      break;
    case "seed-a-wait":
      viewport.classList.add("focus-seed-a");
      viewportChip.hidden = false;
      viewportChip.className = "viewport-chip chip-seed-a";
      viewportChip.textContent = "A端をクリック";
      break;
    case "seed-b-wait":
      viewport.classList.add("focus-seed-b");
      viewportChip.hidden = false;
      viewportChip.className = "viewport-chip chip-seed-b";
      viewportChip.textContent = "B端をクリック";
      break;
  }

  const info =
    selectedPatchId === null
      ? null
      : { id: selectedPatchId, group: resolvePartitionSelectionGroup(selectedPatchId, [...draftGroupA], [...draftGroupB]) };
  ui.setPartitionSelectedPatch(info);
  // T15 P1: the row's static emphasis border must track FOCUS (i.e. "am I
  // in an A/B workflow context"), not selection alone -- selecting a patch
  // during ordinary Pack/delete/mesh work must not visually promote A/B
  // assignment to "the" primary action.
  ui.setPartitionActionEmphasis(focus === "selected");
}

/** A/Bエンドポイントの3Dバッジ位置を更新する（instruction §2.4）。各patchの
 * points[0] を代表点として使う（field.ts の Patch 型doc注記どおり、コイン
 * 以外の形状でも安定した代表点）。 */
function updateEndpointBadges(): void {
  const posOf = (id: number | null): { x: number; y: number; z: number } | null => {
    if (id === null) return null;
    const patch = state.patches.find((pp) => pp.id === id);
    const pt = patch?.points[0];
    return pt ? { x: pt.x, y: pt.y, z: pt.z } : null;
  };
  skinRenderer.setEndpointBadges({ A: posOf(seedAId), B: posOf(seedBId) });
}

// --- T13 coin由来A/B分割 ----------------------------------------------------
// 作者裁定 codex-instruction-20260719-katachi-coin-ab-partition.md: seedから
// 隣接グラフでA候補を提案し（proposeGroupsFromSeeds）、作者が個別パッチを
// 上書きしてから明示的に「確定」して初めて履歴（confirmPartition）へ記録する。
// 確定後、物理分割（buildPartitionMeshes, ownership field）でA/Bそれぞれの
// watertightメッシュを作る。どちらの群が本体/不要かは一切判定しない。

/** If nothing has been proposed/edited yet, start the working draft from the
 * last CONFIRMED partition (so re-opening the panel to tweak one patch
 * doesn't lose the rest), or otherwise put every patch in B (so assigning a
 * single patch to A is a one-click "peel this one off" action instead of
 * requiring a full proposal first). */
function ensureDraftInitialized(): void {
  if (draftGroupA.size > 0 || draftGroupB.size > 0) return;
  if (state.partition) {
    draftGroupA = new Set(state.partition.groupA);
    draftGroupB = new Set(state.partition.groupB);
  } else {
    draftGroupB = new Set(state.patches.map((p) => p.id));
  }
}

function refreshPartitionDraft(): void {
  // Drop any draft membership for patches that no longer exist (e.g. deleted
  // since the draft was built) so counts/coloring stay honest.
  const known = new Set(state.patches.map((p) => p.id));
  for (const id of [...draftGroupA]) if (!known.has(id)) draftGroupA.delete(id);
  for (const id of [...draftGroupB]) if (!known.has(id)) draftGroupB.delete(id);
  for (const id of [...seedPatchIds]) if (!known.has(id)) seedPatchIds.delete(id);
  if (seedAId !== null && !known.has(seedAId)) seedAId = null;
  if (seedBId !== null && !known.has(seedBId)) seedBId = null;

  const a = draftGroupA.size;
  const b = draftGroupB.size;
  const unassigned = state.patches.length - a - b;
  const seedText = `A端 ${seedAId === null ? "未選択" : `#${seedAId}`} / B端 ${seedBId === null ? "未選択" : `#${seedBId}`}`;
  ui.setPartitionDraftInfo(
    `${seedText} / A候補 ${a}個 / B候補 ${b}個` +
      (unassigned > 0 ? ` / 未割当 ${unassigned}個（未確定・警告色で表示）` : ""),
  );
  skinRenderer.updateBeadGroups(a + b > 0 ? { A: new Set(draftGroupA), B: new Set(draftGroupB) } : null);
  updateEndpointBadges();
  updateOperationFocus();
  refreshPartitionTutorial();
  render();
}

/** Discard whatever endpoint selection is in progress (seedA/B, the seed
 * highlight set, and any A/B draft derived from it), invalidate any stale
 * partition build/result via the existing safe path, and refresh every
 * dependent display (badges, bead colors, tutorial, viewport focus) from
 * the same now-cleared state. Shared by onClearSeeds ("clear") and
 * onToggleSeedPickMode(false) when cancelling an INCOMPLETE selection
 * (selection-final-polish P0) -- 「中止」 must discard the half-picked
 * endpoint entirely, not just hide the viewport chrome while seedAId and
 * its badge silently survive underneath. */
function discardEndpointSelection(): void {
  seedPatchIds.clear();
  seedAId = null;
  seedBId = null;
  draftGroupA = new Set();
  draftGroupB = new Set();
  invalidateStalePartitionResult();
  refreshPartitionDraft();
}

function buildTutorialSnapshot(): PartitionTutorialSnapshot {
  const a = draftGroupA.size;
  const b = draftGroupB.size;
  const unassigned = Math.max(0, state.patches.length - a - b);
  return {
    patchCount: state.patches.length,
    seedPickMode,
    seedAId,
    seedBId,
    draftACount: a,
    draftBCount: b,
    unassignedCount: unassigned,
    // "confirmed" must mean THIS exact draft was confirmed, not merely that
    // something was confirmed at some point -- a draft edited after
    // confirming (propose again, move one patch, reselect endpoints) must
    // fall back to step 6, not keep showing build/export as if nothing changed.
    confirmed: draftMatchesConfirmedPartition([...draftGroupA], [...draftGroupB], state.partition),
    workerRunning: activePartitionWorker !== null,
    hasResult: partitionResult !== null,
    gateOk: partitionResult?.gate.ok ?? false,
    visualReviewed: tutorialUi.visualReviewed,
    manualReviewed: tutorialUi.manualReviewed,
  };
}

function persistAndRefreshTutorial(): void {
  saveTutorialPersistedUi(tutorialUi);
  refreshPartitionTutorial();
}

/** State-driven guide step + highlight. Safe to call often; no geometry side effects. */
function refreshPartitionTutorial(): void {
  const raw = buildTutorialSnapshot();
  const corrected = correctTutorialFlags(raw, tutorialUi);
  if (
    corrected.visualReviewed !== tutorialUi.visualReviewed ||
    corrected.manualReviewed !== tutorialUi.manualReviewed
  ) {
    tutorialUi = { ...tutorialUi, ...corrected };
    saveTutorialPersistedUi(tutorialUi);
  }
  const snapshot: PartitionTutorialSnapshot = {
    ...raw,
    visualReviewed: tutorialUi.visualReviewed,
    manualReviewed: tutorialUi.manualReviewed,
  };
  const actualStep = derivePartitionTutorialStep(snapshot);
  // If the real workflow regressed below wherever the author was reading
  // (e.g. reselecting endpoints while browsing a past step), stop pinning to
  // a step the workflow hasn't even reached anymore.
  tutorialDisplayedStep = normalizeDisplayedStep(actualStep, tutorialDisplayedStep);
  // Once the real workflow catches up to wherever the author was reading,
  // resume following it automatically instead of staying pinned to the past.
  if (tutorialDisplayedStep === actualStep) tutorialDisplayedStep = null;
  const displayedStep = tutorialDisplayedStep ?? actualStep;
  const nav = deriveTutorialNavState(actualStep, displayedStep, {
    visualReviewed: tutorialUi.visualReviewed,
    manualReviewed: tutorialUi.manualReviewed,
  });
  ui.setPartitionTutorial({
    open: tutorialUi.open,
    step: nav.displayedStep,
    actualStep,
    isViewingPast: nav.isViewingPast,
    canPrev: nav.canPrev,
    canAdvance: nav.canAdvance,
    advanceMode: nav.advanceMode,
  });
}

function tutorialOpen(): void {
  tutorialUi = { ...tutorialUi, open: true };
  tutorialDisplayedStep = null; // reopen showing the real step, not a stale browsed page
  persistAndRefreshTutorial();
}

function tutorialClose(): void {
  tutorialUi = { ...tutorialUi, open: false };
  persistAndRefreshTutorial();
}

function tutorialPrev(): void {
  // View-only: turn the displayed page back one step. Never touches
  // geometry/history/draft, and never mutates visualReviewed/manualReviewed
  // -- those are real-workflow flags, not reading position.
  const actualStep = derivePartitionTutorialStep(buildTutorialSnapshot());
  const current = tutorialDisplayedStep ?? actualStep;
  const target = Math.max(1, current - 1) as TutorialStepId;
  tutorialDisplayedStep = target === actualStep ? null : target;
  refreshPartitionTutorial();
}

function tutorialAdvance(): void {
  const actualStep = derivePartitionTutorialStep(buildTutorialSnapshot());
  const displayedStep = tutorialDisplayedStep ?? actualStep;
  if (displayedStep !== actualStep) {
    // Browsing a past step: 次へ only turns the page, at most back up to the
    // real position -- it must not set review flags for a step the real
    // workflow isn't actually standing on right now.
    const target = Math.min(actualStep, displayedStep + 1) as TutorialStepId;
    tutorialDisplayedStep = target === actualStep ? null : target;
    refreshPartitionTutorial();
    return;
  }
  // At the real step: this is the only place visualReviewed/manualReviewed
  // may change, and only for the step the workflow is actually asking about.
  if (actualStep === 4) {
    tutorialUi = { ...tutorialUi, visualReviewed: true };
  } else if (actualStep === 5) {
    tutorialUi = { ...tutorialUi, manualReviewed: true };
  }
  persistAndRefreshTutorial();
}

function tutorialRestart(): void {
  // View-only: jump the displayed page to Step 1. Does not reset the real
  // workflow (visualReviewed/manualReviewed, draft, confirm, or build state).
  tutorialDisplayedStep = 1;
  refreshPartitionTutorial();
}

function tutorialReturnToCurrent(): void {
  tutorialDisplayedStep = null;
  refreshPartitionTutorial();
}

/** Any draft edit (propose again, manual A/B move, reselecting endpoints)
 * invalidates whatever a previous build (partitionResult) or an IN-FLIGHT
 * build (activePartitionWorker) was computing -- both were derived from
 * whatever state.partition/draft looked like at the time, and no longer
 * correspond to what's now on screen. Clears them and the export links so
 * the author can never export -- or silently receive -- a result for a
 * configuration that isn't the one currently shown. Does not touch
 * state.partition (the confirmed history record) itself.
 *
 * Deliberately does NOT early-return just because partitionResult is null:
 * partitionResult IS null for the entire duration a build Worker is running
 * (buildPartition() sets it null at the start), so an early return on that
 * alone would let partitionGeneration go unbumped while a build is in
 * flight -- exactly the P0 bug this closes (post-limit-audit-fixes'
 * inflight-draft-fix round; see README Observation v0.11). An in-flight
 * Worker is terminated immediately, not just outrun via the generation
 * check, so a late message from it can never be adopted even if the
 * generation comparison were ever bypassed.
 *
 * Always invalidates unconditionally rather than diffing old/new draft
 * membership first (a redundant "already in that group" click only costs a
 * rare extra re-confirm+rebuild; skipping invalidation risks resurrecting
 * this exact bug) -- see README Observation v0.11 for that trade-off. The
 * status text, however, DOES check whether the post-edit draft still matches
 * the last confirmed configuration (draftMatchesConfirmedPartition) so it
 * can honestly tell the author whether a re-confirm is actually required or
 * whether the edit was a no-op relative to history and only a rebuild is
 * needed (invalidation-status-honesty round; see README Observation v0.11). */
function invalidateStalePartitionResult(): void {
  const hadResult = partitionResult !== null;
  const hadRunningWorker = activePartitionWorker !== null;
  if (!hadResult && !hadRunningWorker) return; // nothing was ever built or building

  partitionGeneration++;
  if (activePartitionWorker) {
    activePartitionWorker.terminate();
    activePartitionWorker = null;
    ui.setPartitionBuildRunning(false);
  }
  partitionResult = null;
  ui.setPartitionExportEnabled(false);
  ui.setPartitionVerificationExportEnabled(false);
  ui.setPartitionMetrics("");
  const stillConfirmed = draftMatchesConfirmedPartition([...draftGroupA], [...draftGroupB], state.partition);
  ui.setPartitionStatus(describePartitionInvalidationStatus(hadRunningWorker, stillConfirmed), false);
  refreshPartitionTutorial();
}

/** T14 §3.2 (extended to thickness/roundK, see onSkinParamChange's doc
 * comment): thickness/roundK/coinBulge are field-shape parameters read live
 * by compositeSdf for every existing patch, so changing any of them stales
 * a built partition result/Worker exactly like a draft edit does -- but the
 * REASON is different (the shape changed under an unchanged A/B grouping,
 * not the grouping itself), so the status text must say so honestly rather
 * than reusing invalidateStalePartitionResult()'s "A/B変更" wording, which
 * would incorrectly suggest the author edited the draft. Reuses
 * invalidateStalePartitionResult()'s generation-bump/Worker-terminate/
 * result-export-metrics-clear mechanics unmodified (does not touch
 * state.partition or the draft groups) and only overrides the status text
 * afterward, and only when something was actually invalidated (avoids a
 * status flash when nothing was ever built). */
function invalidateStaleResultForShapeParamChange(): void {
  const hadSomethingToInvalidate = partitionResult !== null || activePartitionWorker !== null;
  invalidateStalePartitionResult();
  if (hadSomethingToInvalidate) {
    ui.setPartitionStatus("形状設定が変わったため、同じA/B構成でも物理分割をもう一度実行してください", false);
  }
}

function confirmPartition(): void {
  const unassigned = state.patches.filter((p) => !draftGroupA.has(p.id) && !draftGroupB.has(p.id));
  if (draftGroupA.size === 0 || draftGroupB.size === 0 || unassigned.length > 0) {
    alert("A/Bとも1個以上、かつ全パッチを重複・未割当なく割り当ててから確定してください");
    return;
  }
  const selection: PartitionSelection = {
    groupA: [...draftGroupA],
    groupB: [...draftGroupB],
    seedIds: [seedAId, seedBId].filter((id): id is number => id !== null),
    adjacencyThreshold: Math.max(0.001, state.skinParams.roundK * 0.5),
    confirmedAt: new Date().toISOString(),
  };
  record(history, state, "confirmPartition", { selection });
  partitionResult = null;
  partitionGeneration++;
  ui.setPartitionExportEnabled(false);
  ui.setPartitionVerificationExportEnabled(false);
  ui.setPartitionMetrics("");
  ui.setPartitionStatus("確定しました。「確定したA/Bを物理分割してメッシュ化」を押してください");
  afterMutation();
}

function buildPartition(): void {
  if (!state.partition) {
    alert("先にA/B構成を確定してください");
    return;
  }
  // The screen's color split (draftGroupA/B, via updateBeadGroups) can drift
  // from state.partition if the author edited the draft after confirming
  // without re-confirming. Re-check right before computing so the build
  // never silently uses a stale confirmed configuration that no longer
  // matches what's on screen.
  if (!draftMatchesConfirmedPartition([...draftGroupA], [...draftGroupB], state.partition)) {
    alert("A/Bを変更したため、もう一度「確定」してください");
    ui.setPartitionStatus("A/Bを変更したため、もう一度「確定」してください", false);
    refreshPartitionTutorial();
    return;
  }
  if (activePartitionWorker) {
    alert("既に分割を実行中です。完了かキャンセルを待ってください（二重実行防止）");
    return;
  }
  const requestId = ++partitionRequestId;
  const generation = partitionGeneration;
  const worker = new Worker(new URL("./partition.worker.ts", import.meta.url), { type: "module" });
  activePartitionWorker = worker;
  partitionResult = null;
  ui.setPartitionExportEnabled(false);
  ui.setPartitionVerificationExportEnabled(false);
  ui.setPartitionMetrics("");
  ui.setPartitionBuildRunning(true);
  ui.setPartitionStatus("Workerへ計算を送信しています…");
  refreshPartitionTutorial();

  // gate-correction P1-2: every exit path terminates the Worker (a Worker
  // that merely posts a result message stays alive/idle otherwise -- the
  // previous round only terminated it on the error/stale paths).
  const finish = (): void => {
    if (activePartitionWorker === worker) activePartitionWorker = null;
    worker.terminate();
    ui.setPartitionBuildRunning(false);
  };

  worker.onmessage = (event: MessageEvent<PartitionWorkerMessage>) => {
    const msg = event.data;
    if (msg.requestId !== requestId) return; // a stale worker's leftover message
    if (generation !== partitionGeneration) {
      // Patches/confirmation changed while this build was running. P1-2:
      // terminate THE MOMENT this is detected, even mid-progress -- don't
      // let a doomed computation run to completion just because the final
      // message hasn't arrived yet.
      finish();
      ui.setPartitionStatus("パッチ/確定が変更されたため、実行中だった結果を破棄しました");
      refreshPartitionTutorial();
      return;
    }
    if (msg.type === "progress") {
      ui.setPartitionStatus(`${msg.stage}… (経過 ${(msg.elapsedMs / 1000).toFixed(1)}秒)`);
      refreshPartitionTutorial();
      return;
    }
    finish();
    if (msg.type === "error") {
      ui.setPartitionMetrics("");
      ui.setPartitionStatus(`失敗（経過 ${(msg.elapsedMs / 1000).toFixed(1)}秒）: ${msg.message}`, false);
      refreshPartitionTutorial();
      return;
    }
    partitionResult = msg.result;
    const gate = msg.result.gate;
    ui.setPartitionStatus(
      `完了（経過 ${(msg.elapsedMs / 1000).toFixed(1)}秒） / 元形状(保存後)=${msg.result.originalSavedTopology.ok} / A(保存後)=${msg.result.a.savedTopology.ok} / B(保存後)=${msg.result.b.savedTopology.ok} / ${gate.ok ? "通常書き出し可" : "通常書き出し不可"}`,
      gate.ok,
    );
    ui.setPartitionMetrics(formatPartitionMetrics(msg.result));
    ui.setPartitionExportEnabled(gate.ok);
    ui.setPartitionVerificationExportEnabled(true);
    if (state.partition) skinRenderer.updateBeadGroups({ A: new Set(state.partition.groupA), B: new Set(state.partition.groupB) });
    refreshPartitionTutorial();
  };
  worker.onerror = (event) => {
    if (requestId !== partitionRequestId) return;
    finish();
    ui.setPartitionMetrics("");
    ui.setPartitionStatus(`失敗: ${event.message}`, false);
    refreshPartitionTutorial();
  };

  const request: PartitionBuildRequest = {
    type: "build",
    requestId,
    mode: state.mode,
    host: state.host,
    hostK: state.hostParams.k,
    thickness: state.skinParams.thickness,
    patches: state.patches,
    groupA: state.partition.groupA,
    groupB: state.partition.groupB,
    roundK: state.skinParams.roundK,
    options: ui.getMeshOptions(),
    coinBulge: state.skinParams.coinBulge,
  };
  worker.postMessage(request);
}

function cancelPartitionBuild(): void {
  if (!activePartitionWorker) return;
  activePartitionWorker.terminate();
  activePartitionWorker = null;
  ui.setPartitionBuildRunning(false);
  ui.setPartitionStatus("キャンセルしました");
  refreshPartitionTutorial();
}

/** Rough "手が届く/触れる目安" reference -- a bbox extent alone can't tell
 * whether a real hand fits through a narrow opening, so this is presented as
 * a plain size comparison only (instruction §2: "『手が通る』『サポートを
 * 除去できる』と判定しない"). */
const HAND_ACCESS_REFERENCE_MM = [100, 125, 150] as const;

function formatPartitionMetrics(r: PartitionResult): string {
  const mm3 = (v: number) => v.toFixed(2);
  const mm2 = (v: number) => v.toFixed(2);
  const pct = (v: number) => (v * 100).toFixed(2);
  const bboxText = (b: PartitionResult["a"]["mesh"]["mmBounds"]) =>
    `${b.size.x.toFixed(1)} x ${b.size.y.toFixed(1)} x ${b.size.z.toFixed(1)} mm (最長辺 ${b.longest.toFixed(1)} mm)`;
  // winding-volume-final Task 6: "watertight"はOptimizer/trimeshと意味が
  // ずれる（Optimizerのwatertightは境界閉塞のみ、windingを含まない）ため、
  // 閉塞・面方向・退化の3条件を別々に表示する。
  const topologyText = (t: PartitionResult["a"]["savedTopology"]) =>
    `境界閉塞 ${t.closed ? "OK" : "NG"}(開いた辺${t.openEdges}・非多様体辺${t.nonManifoldEdges}) / 面方向整合 ${t.windingConsistent ? "OK" : "NG"}(不整合${t.windingInconsistentEdges}辺) / 退化なし ${t.degenerateFree ? "OK" : "NG"}(${t.degenerateTriangleCount}枚) / 連結成分${t.connectedComponents} / 総合 ${t.ok ? "OK" : "NG"}`;
  const boundaryEquivDiameter = Math.sqrt((4 * r.boundaryAreaMm2) / Math.PI);
  const referenceLine = HAND_ACCESS_REFERENCE_MM.map(
    (mm) => `${mm}mm比: 共有境界の等価直径比 ${(boundaryEquivDiameter / mm).toFixed(2)}倍`,
  ).join(" / ");
  const g = r.gate;
  const quantityLine = (label: string, q: (typeof g)["overlap"], fq: PartitionResult["meshFidelity"]["overlap"]) =>
    `${label}: 点推定 ${mm3(fq.volumeMm3)}mm3 (${pct(q.ratio)}%) / 95%上限 ${mm3(fq.upper95VolumeMm3)}mm3 (${pct(q.upper95Ratio)}%) / 許容${pct(q.toleranceRatio)}% / ${q.ok ? "OK" : "NG"}`;
  const volumeDiffText =
    r.volumeDiffMm3 === null
      ? "無効（元形状/A/Bのいずれかのトポロジーが無効なため計算不可）"
      : `${mm3(r.volumeDiffMm3)} mm3 (${pct(g.volumeDiff.ratio)}%、許容${pct(g.volumeDiff.toleranceRatio)}%、${g.volumeDiff.ok ? "OK" : "NG"})`;
  return [
    `元形状: 体積 ${mm3(r.originalVolumeMm3)} mm3 (符号付き ${r.originalSignedVolumeMm3.toFixed(2)}) / ${topologyText(r.originalSavedTopology)}`,
    `part-A: Patch ${r.a.patchIds.length}個 (ID ${r.a.patchIds.join(",")}) / 体積 ${mm3(r.a.volumeMm3)} mm3 (符号付き ${r.a.signedVolumeMm3.toFixed(2)}) / 面 ${r.a.mesh.triangles.length} / 保存時退化面除去 ${r.a.mesh.removedSavedDegenerateTriangleCount ?? 0}枚 / ${topologyText(r.a.savedTopology)}`,
    `  Scale適用後bbox: ${bboxText(r.a.mesh.mmBounds)}`,
    `part-B: Patch ${r.b.patchIds.length}個 (ID ${r.b.patchIds.join(",")}) / 体積 ${mm3(r.b.volumeMm3)} mm3 (符号付き ${r.b.signedVolumeMm3.toFixed(2)}) / 面 ${r.b.mesh.triangles.length} / 保存時退化面除去 ${r.b.mesh.removedSavedDegenerateTriangleCount ?? 0}枚 / ${topologyText(r.b.savedTopology)}`,
    `  Scale適用後bbox: ${bboxText(r.b.mesh.mmBounds)}`,
    `共通Scale: ${r.scaleMmPerUnit.toFixed(6)} mm/unit（original/A/B共通 = ${g.commonScale}）`,
    `境界面積（三角形走査の近似） ${mm2(r.boundaryAreaMm2)} mm2 / 等価直径（参考値、円と仮定） ${boundaryEquivDiameter.toFixed(1)} mm`,
    `  ${referenceLine}（作者の比較目盛りであり、手が通る/サポートを除去できるの判定ではない）`,
    `体積指標の有効性: ${g.volumeMetricsValid ? "有効（元形状/A/Bとも保存後トポロジー有効）" : "無効（元形状またはA/Bの保存後トポロジーが無効）"}`,
    `A+Bとの体積差: ${volumeDiffText}`,
    `[解析場の整合 fieldConsistency（式の自己矛盾チェック・出力メッシュは未参照・参考値）] 重複 ${mm3(r.fieldConsistency.overlapVolumeMm3)} mm3 / 未割当 ${mm3(r.fieldConsistency.gapVolumeMm3)} mm3 （${r.fieldConsistency.sampleCount}点中${r.fieldConsistency.insideOriginalSamples}点が元形状内）`,
    `[実メッシュ検証 meshFidelity（採用ゲートが見る値・出力三角形を実測、95%上限はWilson score）]`,
    `  重複・未割当は元形状内部サンプルに条件付け、元形状の実体積でスケール。不整合はbbox全体に対する保守的上限を元形状の実体積で割った比率。`,
    `  ${quantityLine("重複（元形状内部でA/B両方）", g.overlap, r.meshFidelity.overlap)}`,
    `  ${quantityLine("未割当（元形状内部だがA/Bどちらでもない）", g.gap, r.meshFidelity.gap)}`,
    `  ${quantityLine("不整合(A/Bにあるが元形状外)", g.inconsistent, r.meshFidelity.inconsistent)}`,
    `  （${r.meshFidelity.sampleCount}点中${r.meshFidelity.insideOriginalSamples}点が元形状内、seed=${r.meshFidelity.seed}、insideOriginalSamplesValid=${g.insideOriginalSamplesValid}）`,
    `ゲート判定: ${g.ok ? "合格（通常書き出し可）" : `不合格: ${g.reasons.join(" / ")}`}`,
  ].join("\n");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 4-file export (instruction §3): `<base>-part-a.stl`, `<base>-part-b.stl`,
 * `<base>-partition.recipe.json` (history including confirmPartition --
 * replay reproduces the identical A/B without re-running any RNG/proposal),
 * `<base>-partition-provenance.json`. `verification=true` bypasses the
 * watertight/overlap/gap gate for an explicitly-labeled "検証用・非合格"
 * output (audit fix P0-3) -- the filename itself carries an UNVERIFIED
 * marker so it can never be mistaken for a normal, gated export. Both
 * sides' metrics are always written to provenance regardless of which
 * STL(s) `parts` actually requests, so "反対側をどう扱ったか" is never lost.
 */
async function exportPartition(parts: Array<"A" | "B">, verification: boolean): Promise<void> {
  if (!partitionResult || !state.partition) return;
  const gate = partitionResult.gate;
  if (!verification && !gate.ok) {
    alert("通常書き出しはwatertight・重複・未割当・体積差が許容値内のときだけ有効です。「検証用として書き出す（非合格）」を使ってください");
    return;
  }
  // gate-correction: previous round's stamp was YYYYMMDD only, colliding
  // with an already-downloaded verification artifact from an earlier round
  // (that file is explicitly kept as-is, not to be overwritten -- see
  // README.md/manifest.json this round's notes). Full to-the-second
  // timestamp avoids any same-day collision.
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const baseName = verification ? `yohaku-skin-partition-UNVERIFIED-${stamp}` : `yohaku-skin-partition-${stamp}`;
  const bytesA = encodeBinaryStl(partitionResult.a.mesh, `${baseName}-part-a`);
  const bytesB = encodeBinaryStl(partitionResult.b.mesh, `${baseName}-part-b`);
  const [stlASha256, stlBSha256] = await Promise.all([sha256Hex(bytesA), sha256Hex(bytesB)]);
  if (parts.includes("A")) downloadBlob(new Blob([bytesA], { type: "model/stl" }), `${baseName}-part-a.stl`);
  if (parts.includes("B")) downloadBlob(new Blob([bytesB], { type: "model/stl" }), `${baseName}-part-b.stl`);
  downloadBlob(new Blob([serializeRecipe(history)], { type: "application/json" }), `${baseName}-partition.recipe.json`);
  // gate-correction: distinguish an actually-downloaded side (real filename,
  // hash of the bytes that were saved) from a side that was only computed
  // in-memory for this export call -- the previous round recorded both
  // sides as if both had been written to disk regardless of `parts`.
  const outputStl = {
    partA: parts.includes("A")
      ? { filename: `${baseName}-part-a.stl`, sha256: stlASha256, saved: true as const }
      : { sha256: stlASha256, saved: false as const, note: "generatedButNotDownloaded" as const },
    partB: parts.includes("B")
      ? { filename: `${baseName}-part-b.stl`, sha256: stlBSha256, saved: true as const }
      : { sha256: stlBSha256, saved: false as const, note: "generatedButNotDownloaded" as const },
  };
  const provenance = {
    generatedAt: new Date().toISOString(),
    tool: { name: "Katachi S-skin", version: manifest.version, updatedAt: manifest.updatedAt },
    mode: state.mode,
    resolution: partitionResult.resolution,
    targetLongestMm: partitionResult.targetLongestMm,
    scaleMmPerUnit: partitionResult.scaleMmPerUnit,
    scaleAssumption: "scaleMmPerUnitはmeshの最長辺をtargetLongestMmへ合わせた結果の倍率であり、実機較正値ではない。original/A/Bは共通のこの倍率でRescaleされている（gate.commonScaleで検証）",
    exportedParts: parts,
    verification,
    // T14 (instruction §3.3): explicit shape parameters, not just implied by
    // inputRecipe -- coinBulge changes the generated field, so a provenance
    // reader must be able to tell WITHOUT replaying the recipe whether this
    // export used the coin-bulge experiment and at what value.
    shapeParameters: {
      thickness: state.skinParams.thickness,
      roundK: state.skinParams.roundK,
      coinBulge: state.skinParams.coinBulge,
    },
    gate,
    inputRecipe: { filename: importedRecipeFilename, sha256: importedRecipeSha256 },
    outputStl,
    original: {
      volumeMm3: partitionResult.originalVolumeMm3,
      signedVolumeMm3: partitionResult.originalSignedVolumeMm3,
      savedTopology: partitionResult.originalSavedTopology,
    },
    partA: {
      patchIds: partitionResult.a.patchIds,
      volumeMm3: partitionResult.a.volumeMm3,
      signedVolumeMm3: partitionResult.a.signedVolumeMm3,
      faceCount: partitionResult.a.mesh.triangles.length,
      connectedComponents: partitionResult.a.connectedComponents,
      mmBounds: partitionResult.a.mesh.mmBounds,
      savedTopology: partitionResult.a.savedTopology,
      removedSavedDegenerateTriangleCount: partitionResult.a.mesh.removedSavedDegenerateTriangleCount ?? 0,
    },
    partB: {
      patchIds: partitionResult.b.patchIds,
      volumeMm3: partitionResult.b.volumeMm3,
      signedVolumeMm3: partitionResult.b.signedVolumeMm3,
      faceCount: partitionResult.b.mesh.triangles.length,
      connectedComponents: partitionResult.b.connectedComponents,
      mmBounds: partitionResult.b.mesh.mmBounds,
      savedTopology: partitionResult.b.savedTopology,
      removedSavedDegenerateTriangleCount: partitionResult.b.mesh.removedSavedDegenerateTriangleCount ?? 0,
    },
    originalVolumeMm3: partitionResult.originalVolumeMm3,
    volumeDiffMm3: partitionResult.volumeDiffMm3,
    volumeMetricsValid: gate.volumeMetricsValid,
    boundaryAreaMm2: partitionResult.boundaryAreaMm2,
    fieldConsistency: partitionResult.fieldConsistency,
    meshFidelity: partitionResult.meshFidelity,
    allPatchIds: state.patches.map((p) => p.id),
    seedIds: state.partition.seedIds,
    adjacencyThreshold: state.partition.adjacencyThreshold,
    confirmedAt: state.partition.confirmedAt,
    limitations: [
      "boundaryAreaMm2は三角形走査による近似（解析的な厳密面積ではない）。等価直径は円と仮定した参考値",
      "fieldConsistencyは解析場の自己矛盾チェックであり、出力メッシュそのものの重複・隙間は測っていない",
      "meshFidelityのoverlap/gapは元形状内部サンプルに条件付けたWilson score intervalの95%上側信頼限界を元形状の実体積（符号付き三角形和）でスケールしたもの。inconsistentはサンプリングbbox全体に対する保守的上限を元形状の実体積で割った比率（数式・限界はskin/README.md Observation参照）",
      "savedTopologyはFloat32で丸めた保存後の三角形から判定した値（Float64のin-memory三角形とは異なりうる）。closed/windingConsistent/degenerateFreeがすべて真の場合のみokがtrue",
      "volumeMetricsValid=falseの場合、volumeDiffMm3はnullであり、体積・統計指標は合否判定に使用されていない",
      "ownership fieldはA/B別々のcompositeSdf差分による近似で、真の測地距離分割ではない",
      "100/125/150mm比較値は作者の比較目盛りであり、手が通る/サポートを除去できるの判定ではない",
      "この分割・数値はKatachi生成場からの推定であり、実物の強度・接合可能性・印刷可能性を保証しない",
      verification ? "verification=trueは通常のwatertight/重複/隙間/体積差ゲートを満たしていない出力です。検証・調査以外の用途に使わないでください" : null,
    ].filter((s): s is string => s !== null),
  };
  downloadBlob(
    new Blob([JSON.stringify(provenance, null, 2)], { type: "application/json" }),
    `${baseName}-partition-provenance.json`,
  );
}

// --- History export / import ----------------------------------------------

function exportHistory(): void {
  const json = serializeRecipe(history);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `skin-recipe-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function applyRecipeText(text: string): void {
  cancelPartitionBuild();
  const entries = parseRecipe(text);
  history = entries;
  state = replay(entries);
  selectedPatchId = null;
  lastPackResult = null;
  seedPatchIds.clear();
  seedAId = null;
  seedBId = null;
  if (state.partition) {
    for (const id of state.partition.seedIds) seedPatchIds.add(id);
    seedAId = state.partition.seedIds[0] ?? null;
    seedBId = state.partition.seedIds[1] ?? null;
    draftGroupA = new Set(state.partition.groupA);
    draftGroupB = new Set(state.partition.groupB);
  } else {
    draftGroupA = new Set();
    draftGroupB = new Set();
  }
  partitionResult = null;
  partitionGeneration++;
  ui.setPartitionExportEnabled(false);
  ui.setPartitionVerificationExportEnabled(false);
  ui.setPartitionMetrics("");
  ui.setPartitionStatus(state.partition ? "確定済みのA/Bを読み込みました。物理分割を実行してください" : "未分割");
  // Recipe change: drop author-review flags so the guide does not stick on
  // a step that no longer matches the loaded state (state wins), and stop
  // browsing any past-step page so the guide shows the new real step.
  tutorialUi = {
    ...tutorialUi,
    visualReviewed: false,
    manualReviewed: false,
  };
  tutorialDisplayedStep = null;
  saveTutorialPersistedUi(tutorialUi);
  ui.syncHostParams(state.hostParams);
  ui.syncSkinParams(state.skinParams);
  ui.setMode(state.mode);
  afterMutation();
  refreshPartitionDraft();
}

async function importHistory(file: File): Promise<void> {
  try {
    const text = await file.text();
    // Captured BEFORE applyRecipeText/replay touches anything -- this is the
    // hash of the exact bytes the author picked, cited in partition
    // provenance as `inputRecipe` (instruction: "入力recipe SHA-256").
    importedRecipeSha256 = await sha256Hex(text);
    importedRecipeFilename = file.name;
    applyRecipeText(text);
  } catch (err) {
    alert(`履歴の読み込みに失敗しました: ${(err as Error).message}`);
  }
}

async function importS1Recipe(file: File): Promise<void> {
  try {
    const text = await file.text();
    const { balls, params } = loadHostFromS1Recipe(text);
    record(history, state, "loadHostFromS1Recipe", { balls, params, source: "S1" });
    ui.syncHostParams(state.hostParams);
    afterMutation();
  } catch (err) {
    alert(`S1 レシピの読み込みに失敗しました: ${(err as Error).message}`);
  }
}

function inspectMesh(options: MeshUiOptions): void {
  try {
    ui.setMeshStatus("検査中...");
    const result = buildSkinMesh(
      state.mode,
      state.host,
      state.hostParams.k,
      state.skinParams.thickness,
      state.patches,
      state.skinParams.roundK,
      options,
      state.skinParams.coinBulge,
    );
    ui.setMeshStatus(meshSummary(result), result.watertight.ok);
  } catch (err) {
    ui.setMeshStatus(`検査失敗: ${(err as Error).message}`, false);
  }
}

function exportMesh(options: MeshUiOptions): void {
  try {
    ui.setMeshStatus("書き出し準備中...");
    const result = buildSkinMesh(
      state.mode,
      state.host,
      state.hostParams.k,
      state.skinParams.thickness,
      state.patches,
      state.skinParams.roundK,
      options,
      state.skinParams.coinBulge,
    );
    ui.setMeshStatus(meshSummary(result), result.watertight.ok);
    downloadSkinMeshBundle(result, history, makeSkinExportBaseName(state.mode, state.skinParams.coinBulge));
  } catch (err) {
    ui.setMeshStatus(`書き出し失敗: ${(err as Error).message}`, false);
  }
}

// --- Gauges -----------------------------------------------------------
// Computed on-demand after state mutations (not every animation frame), same
// convention as pack/main.ts's refreshGauges.

function refreshGauges(): void {
  const mortar = estimateMortar(state.patches);
  const coverage = estimateCoverage(
    state.host,
    state.hostParams.k,
    state.skinParams.thickness,
    state.patches,
    state.skinParams.roundK,
  );
  const patchComponents = estimatePatchComponents(state.patches, state.skinParams.roundK);
  const bounds = state.host.length > 0 ? computeSamplingBounds(state.host, state.hostParams.k) : null;
  const { targetLongestMm } = ui.getMeshOptions();
  const mmPerUnit = bounds && bounds.longest > 0 ? targetLongestMm / bounds.longest : 1;
  const linking = estimateRingLinking(state.patches);
  const overlaps = findDeepPatchOverlaps(state.patches);
  ui.setGauges(mortar, coverage, patchComponents, mmPerUnit, linking, overlaps);
}

function totalPatchPoints(): number {
  return state.patches.reduce((s, p) => s + p.points.length, 0);
}

/** Switch the active view. "mesh" (re)builds the true marching-tets geometry
 * on demand (expensive, so only ever done here, not on every mutation --
 * same T11 discipline the old setMeshOverlay toggle had). "beads" assumes
 * skinRenderer's InstancedMeshes are already current (afterMutation() keeps
 * them in sync); switching TO beads here still rebuilds once so a manual
 * click right after a skinParam-only change (which skips the bead rebuild,
 * see afterMutation's skipGauges branch) shows current data. */
function setViewMode(mode: SkinViewMode): void {
  viewMode = mode;
  if (mode === "mesh") {
    try {
      const opts = ui.getMeshOptions();
      const mesh = buildSkinMesh(
        state.mode, state.host, state.hostParams.k, state.skinParams.thickness, state.patches, state.skinParams.roundK,
        { resolution: Math.min(opts.resolution, 128), targetLongestMm: opts.targetLongestMm },
        state.skinParams.coinBulge,
      );
      skinRenderer.setMeshOverlay(mesh.triangles);
    } catch (err) {
      alert(`全体メッシュの生成に失敗しました: ${(err as Error).message}`);
      viewMode = "raymarch";
    }
  } else if (mode === "beads") {
    skinRenderer.updateBeads(state.host, state.patches, selectedPatchId);
  }
  skinRenderer.setViewMode(viewMode);
  ui.setViewMode(viewMode, totalPatchPoints(), state.skinParams.coinBulge);
}

function afterMutation(opts: { skipGauges?: boolean } = {}): void {
  ui.setHistoryCount(history.length);
  ui.setPackResult(lastPackResult);
  const totalPoints = totalPatchPoints();
  if (viewMode === "mesh") {
    // Any mutation invalidates the cached triangle soup -- don't leave a
    // stale mesh on screen (T11's rule, kept for T12's three-way toggle).
    skinRenderer.setMeshOverlay(null);
    viewMode = totalPoints > PATCH_MAX_POINTS ? "beads" : "raymarch";
  }
  if (!opts.skipGauges) {
    // Bead geometry only needs rebuilding when host/patches actually
    // changed -- skinParam slider drags call afterMutation({skipGauges:
    // true}) precisely because they don't touch host/patches yet (only the
    // next "詰める" does), so this stays cheap during dragging even with
    // thousands of bead instances.
    skinRenderer.updateBeads(state.host, state.patches, selectedPatchId);
    // T12 §2 "自動切替": once the point count exceeds the raymarch's
    // uniform-array budget, stop silently under-drawing (T11's "隙間だら
    // け" bug) and switch to the uncapped bead view instead. Only fires
    // when currently ON raymarch -- a user who deliberately chose "全体メ
    // ッシュ" or already switched to beads is left alone.
    if (totalPoints > PATCH_MAX_POINTS && viewMode === "raymarch") {
      viewMode = "beads";
      ui.setAutoSwitchNotice(true);
    } else {
      ui.setAutoSwitchNotice(false);
    }
  }
  skinRenderer.setViewMode(viewMode);
  ui.setViewMode(viewMode, totalPoints, state.skinParams.coinBulge);
  updateSelectionLabel();
  if (!opts.skipGauges) {
    refreshGauges();
    // T13: a structural patch change (pack/add/remove/clear) invalidates any
    // in-progress or built partition (history.ts's applyEntry already nulls
    // state.partition for those ops) -- keep the panel/renderer/export
    // buttons honest about that instead of showing a stale A/B split.
    // T13 audit fix: any structural patch change stales an in-flight or
    // completed partition build, regardless of whether a result had already
    // arrived -- bump the generation unconditionally so a worker response
    // that lands after this point gets discarded (see buildPartition()).
    partitionGeneration++;
    if (!state.partition && partitionResult) {
      partitionResult = null;
      ui.setPartitionExportEnabled(false);
      ui.setPartitionVerificationExportEnabled(false);
      ui.setPartitionMetrics("");
      ui.setPartitionStatus("パッチが変更されたため未分割に戻りました");
    }
    refreshPartitionDraft();
  }
  render();
}

// Debug / verification handle (used by automated checks and the "same shape
// after import" test in README). Read state, or feed a recipe directly.
(window as unknown as Record<string, unknown>).__skin = {
  getHost: () => state.host.map((b) => ({ ...b })),
  getPatches: () => state.patches.map((p) => ({ id: p.id, shape: p.shape, points: p.points.map((pt) => ({ ...pt })) })),
  getHostParams: () => ({ ...state.hostParams }),
  getSkinParams: () => ({ ...state.skinParams }),
  getMode: () => state.mode,
  getHistory: () => history.map((e) => ({ ...e })),
  exportJson: () => serializeRecipe(history),
  importJson: (text: string) => applyRecipeText(text),
  setMode: (mode: "plate" | "window") => {
    record(history, state, "setMode", { mode });
    ui.setMode(state.mode);
    render();
  },
  packPatches: () => {
    const result = packPatchesGreedy(state.host, state.hostParams.k, state.patches, state.skinParams);
    lastPackResult = result;
    record(history, state, "packPatches", { patches: result.patches });
    afterMutation();
    return result;
  },
  inspectMesh: (options: MeshUiOptions) =>
    buildSkinMesh(state.mode, state.host, state.hostParams.k, state.skinParams.thickness, state.patches, state.skinParams.roundK, options, state.skinParams.coinBulge),
  getViewMode: () => viewMode,
  setViewMode: (mode: SkinViewMode) => setViewMode(mode),
  getTotalPatchPoints: () => totalPatchPoints(),
  getSelectedPatchId: () => selectedPatchId,
  // Direct render-cost measurement (ms/frame averaged over n calls),
  // bypassing requestAnimationFrame -- rAF is throttled or paused entirely
  // in a backgrounded/automated tab (document.hidden), which makes the
  // on-screen fps counter (tick()) unusable for verification in that
  // environment. This calls the SAME renderer.render() the real loop uses,
  // orbiting the camera slightly each call so OrbitControls' damping update
  // isn't skipped, giving an honest per-frame cost independent of tab focus.
  benchmarkRender: (n = 120) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      skinRenderer.camera.position.x += Math.sin(i) * 0.001;
      skinRenderer.render();
    }
    const ms = (performance.now() - t0) / n;
    return { msPerFrame: ms, fps: 1000 / ms, frames: n };
  },
  gauges: () => ({
    mortar: estimateMortar(state.patches),
    coverage: estimateCoverage(state.host, state.hostParams.k, state.skinParams.thickness, state.patches, state.skinParams.roundK),
    patchComponents: estimatePatchComponents(state.patches, state.skinParams.roundK),
    linking: estimateRingLinking(state.patches),
    overlaps: findDeepPatchOverlaps(state.patches),
  }),
  // --- T13 coin由来A/B分割 debug handle (same convention as the rest of
  // __skin: read state, or drive it directly, for manual/automated checks
  // since this project has no test runner -- see AGENTS.md §3) ------------
  getAdjacency: () => buildPatchAdjacency(state.patches, state.skinParams.roundK),
  getSeedIds: () => [...seedPatchIds],
  setSeedIds: (ids: number[]) => {
    seedPatchIds.clear();
    seedAId = ids[0] ?? null;
    seedBId = ids[1] ?? null;
    if (seedAId !== null) seedPatchIds.add(seedAId);
    if (seedBId !== null) seedPatchIds.add(seedBId);
    refreshPartitionDraft();
  },
  proposeGroups: () => {
    lastAdjacencyEdges = buildPatchAdjacency(state.patches, state.skinParams.roundK);
    const proposal = seedAId !== null && seedBId !== null
      ? proposeGroupsBetweenEndpoints(state.patches, lastAdjacencyEdges, seedAId, seedBId)
      : proposeGroupsFromSeeds(state.patches, lastAdjacencyEdges, [...seedPatchIds]);
    draftGroupA = new Set(proposal.groupA);
    draftGroupB = new Set(proposal.groupB);
    invalidateStalePartitionResult();
    refreshPartitionDraft();
    return proposal;
  },
  getDraftGroups: () => ({ groupA: [...draftGroupA], groupB: [...draftGroupB] }),
  draftMatchesConfirmed: () => draftMatchesConfirmedPartition([...draftGroupA], [...draftGroupB], state.partition),
  assignPatchToGroup: (id: number, group: "A" | "B") => {
    ensureDraftInitialized();
    draftGroupA.delete(id);
    draftGroupB.delete(id);
    (group === "A" ? draftGroupA : draftGroupB).add(id);
    invalidateStalePartitionResult();
    refreshPartitionDraft();
  },
  confirmPartition: () => confirmPartition(),
  getPartition: () => (state.partition ? { ...state.partition } : null),
  /** Now Worker-driven (T13 audit fix P0-2) -- returns a Promise that
   * resolves once the build finishes (result, error, or discarded-as-stale),
   * for manual/automated verification (this project has no test runner,
   * see AGENTS.md §3 -- window.__skin is the established debug convention). */
  buildPartition: (): Promise<PartitionResult | null> => {
    buildPartition();
    return new Promise((resolve) => {
      const poll = () => {
        if (activePartitionWorker) {
          setTimeout(poll, 200);
          return;
        }
        resolve(partitionResult);
      };
      setTimeout(poll, 200);
    });
  },
  cancelPartitionBuild: () => cancelPartitionBuild(),
  getPartitionResult: () => partitionResult,
  getPartitionGate: () => partitionResult?.gate ?? null,
  getImportedRecipeInfo: () => ({ filename: importedRecipeFilename, sha256: importedRecipeSha256 }),
  // Guided tutorial (read-only / open-close helpers for verification).
  getPartitionTutorial: () => {
    const actualStep = derivePartitionTutorialStep(buildTutorialSnapshot());
    const displayedStep = tutorialDisplayedStep ?? actualStep;
    return {
      ...tutorialUi,
      step: displayedStep,
      actualStep,
      displayedStep,
      isViewingPast: displayedStep !== actualStep,
      snapshot: buildTutorialSnapshot(),
    };
  },
  openPartitionTutorial: () => tutorialOpen(),
  closePartitionTutorial: () => tutorialClose(),
  tutorialPrev: () => tutorialPrev(),
  tutorialAdvance: () => tutorialAdvance(),
  tutorialRestart: () => tutorialRestart(),
  tutorialReturnToCurrent: () => tutorialReturnToCurrent(),
};

// --- Render loop ------------------------------------------------------

function render(): void {
  skinRenderer.update(
    state.host,
    state.hostParams.k,
    state.skinParams.thickness,
    state.patches,
    state.skinParams.roundK,
    state.mode,
    selectedPatchId,
    state.skinParams.coinBulge,
  );
}

let lastFrame = performance.now();
let frameCount = 0;
let fpsAccum = 0;

function renderFrame(now: number): void {
  const dt = now - lastFrame;
  lastFrame = now;
  frameCount++;
  fpsAccum += dt;
  if (fpsAccum >= 500) {
    ui.setFps(1000 / (fpsAccum / frameCount));
    fpsAccum = 0;
    frameCount = 0;
  }
  skinRenderer.render();
}

render();
startFrameLoop(renderFrame);

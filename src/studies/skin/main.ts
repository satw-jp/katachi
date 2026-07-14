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
import manifest from "./manifest.json";
import { DEFAULT_FIELD_PARAMS } from "../cloud-sculpt/field.ts";
import { computeSamplingBounds } from "../cloud-sculpt/meshExport.ts";
import type { SkinHistoryEntry } from "./history.ts";
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
  estimateCoverage,
  estimateMortar,
  estimatePatchComponents,
  freshPatchId,
  generateShapePoints,
  packPatchesGreedy,
  projectToSurface,
} from "./field.ts";
import type { Patch, PackPatchesResult } from "./field.ts";
import { estimateRingLinking, findDeepPatchOverlaps } from "./linking.ts";
import { buildSkinMesh, downloadSkinMeshBundle, makeSkinExportBaseName, meshSummary } from "./meshExport.ts";
import type { SkinViewMode } from "./renderer.ts";
import { SkinRenderer } from "./renderer.ts";
import { raymarchComposite, raymarchHost } from "./picking.ts";
import { HOST_MAX_BALLS, PATCH_MAX_COUNT, PATCH_MAX_POINTS } from "./shaders.ts";
import type { MeshUiOptions } from "./ui.ts";
import { buildUi } from "./ui.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";

const app = document.getElementById("app")!;
const viewport = document.createElement("div");
viewport.id = "viewport";
app.appendChild(viewport);

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
  },
  onManualRadiusChange: (r) => {
    manualRadius = r;
  },
  onDeleteSelectedPatch: () => deleteSelectedPatch(),
  onExport: () => exportHistory(),
  onImportFile: (file) => importHistory(file),
  onMeshInspect: (options) => inspectMesh(options),
  onMeshExport: (options) => exportMesh(options),
});
ui.setMode(state.mode);
skinRenderer.resize();
afterMutation();

// --- Pointer interaction ---------------------------------------------------
// Click (no drag) on a patch -> select it (toggle). Click on host skin while
// "add patch" mode is active -> place a manual patch there. Same click/orbit
// disambiguation pattern as pack/cloud-sculpt.

let pointerDownPos: { x: number; y: number } | null = null;
const DRAG_THRESHOLD = 4;

function ndcFromEvent(e: PointerEvent): { x: number; y: number } {
  const rect = viewport.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  return { x, y };
}

viewport.addEventListener("pointerdown", (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});

window.addEventListener("pointerup", (e) => {
  if (!pointerDownPos) return;
  const dx = e.clientX - pointerDownPos.x;
  const dy = e.clientY - pointerDownPos.y;
  pointerDownPos = null;
  if (Math.hypot(dx, dy) > DRAG_THRESHOLD) return; // was an orbit drag, not a click
  if (!isEventOnViewport(e)) return;
  handleClick(e);
});

function isEventOnViewport(e: PointerEvent): boolean {
  return (e.target as HTMLElement)?.closest?.("#viewport") != null;
}

function handleClick(e: PointerEvent): void {
  const { x, y } = ndcFromEvent(e);
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

  const hit = raymarchComposite(
    state.mode,
    state.host,
    state.hostParams.k,
    state.skinParams.thickness,
    state.patches,
    state.skinParams.roundK,
    ray.origin,
    ray.dir,
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
  ui.setSelectionInfo(
    (p ? `選択中: パッチ #${p.id} (${p.shape}・点${p.points.length}個)` : "選択なし") + hostCap + patchCap + pointCap,
  );
  ui.setCounts(state.host.length, state.patches.length);
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
  const entries = parseRecipe(text);
  history = entries;
  state = replay(entries);
  selectedPatchId = null;
  lastPackResult = null;
  ui.syncHostParams(state.hostParams);
  ui.syncSkinParams(state.skinParams);
  ui.setMode(state.mode);
  afterMutation();
}

async function importHistory(file: File): Promise<void> {
  try {
    applyRecipeText(await file.text());
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
    );
    ui.setMeshStatus(meshSummary(result), result.watertight.ok);
    downloadSkinMeshBundle(result, history, makeSkinExportBaseName(state.mode));
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
  ui.setViewMode(viewMode, totalPatchPoints());
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
  ui.setViewMode(viewMode, totalPoints);
  updateSelectionLabel();
  if (!opts.skipGauges) refreshGauges();
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
    buildSkinMesh(state.mode, state.host, state.hostParams.k, state.skinParams.thickness, state.patches, state.skinParams.roundK, options),
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
  );
}

let lastFrame = performance.now();
let frameCount = 0;
let fpsAccum = 0;

function tick(): void {
  requestAnimationFrame(tick);
  const now = performance.now();
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
tick();

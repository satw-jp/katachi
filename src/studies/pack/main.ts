// ---------------------------------------------------------------------------
// S-pack (T9) — entry point. Wires host field (shared with S1) + pack field
// (this Study's unit packing + composite SDF) + history + renderer + UI.
// See README.md for Question/Setup/Observation/Hypothesis/Next.
//
// Interaction scope (仮決め, documented per AGENTS §3): NO dragging of units.
// S-rings hit a real bug from differential drag math re-planing every frame
// (see rings/README.md's "作者実機で発見" entry) — rather than re-solve that
// class of bug here, this Study sidesteps it: units are placed by the greedy
// packer, or by a single click (manual add), or removed by click-select +
// Delete. No pointermove-driven movement of an existing unit exists to go
// wrong.
//
// T14: the packed thing is a UNIT (PackUnit — a group of balls with its own
// local roundness), selected/deleted as a whole. Selection state is a unit
// id, not a ball id.
// ---------------------------------------------------------------------------

import "./style.css";
import * as THREE from "three";
import manifest from "./manifest.json";
import { DEFAULT_FIELD_PARAMS } from "../cloud-sculpt/field.ts";
import { computeSamplingBounds } from "../cloud-sculpt/meshExport.ts";
import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import type { PackHistoryEntry } from "./history.ts";
import {
  createEmptyState,
  loadCloudPrototypeFromS1Recipe,
  loadHostFromS1Recipe,
  parseRecipe,
  record,
  replay,
  serializeRecipe,
} from "./history.ts";
import {
  DEFAULT_PACK_PARAMS,
  buildUnit,
  estimateFillRatio,
  estimateThinnestWall,
  flattenUnits,
  packUnitsGreedy,
  packUnitsGrid,
} from "./field.ts";
import type { PackParams, PackResult, UnitKind } from "./field.ts";
import { buildPackMesh, downloadPackMeshBundle, makePackExportBaseName, meshSummary } from "./meshExport.ts";
import type { PackViewMode } from "./renderer.ts";
import { PackRenderer } from "./renderer.ts";
import { raymarchComposite, raymarchHost } from "./picking.ts";
import { HOST_MAX_BALLS, VOID_MAX_BALLS, VOID_MAX_UNITS } from "./shaders.ts";
import type { MeshUiOptions } from "./ui.ts";
import { buildUi } from "./ui.ts";

const app = document.getElementById("app")!;
const viewport = document.createElement("div");
viewport.id = "viewport";
app.appendChild(viewport);

// --- State -------------------------------------------------------------
let history: PackHistoryEntry[] = [];
let state = createEmptyState();
let selectedUnitId: number | null = null;
let addUnitMode = false;
let manualRadius = DEFAULT_PACK_PARAMS.maxR * 0.5;
let lastPackResult: PackResult | null = null;
let viewMode: PackViewMode = "raymarch";

const packRenderer = new PackRenderer(viewport);

// Seed the initial host so the app opens with something to look at (same
// default grow S1 opens with) and give the pack params a starting point.
record(history, state, "growHost", { params: { ...DEFAULT_FIELD_PARAMS } });

function totalUnitBalls(): number {
  return flattenUnits(state.units).length;
}

/** T15 §2: "詰める" dispatches to random (T9's greedy) or grid (new)
 * placement depending on packParams.placementMode. Both return the same
 * PackResult shape and the caller records the SAME "packUnits" op either
 * way (T15 spec: "履歴 op は現行の流儀（結果の単位リストを引数に持つ）" —
 * history doesn't care which algorithm produced the result, only the
 * result itself, so no new op type was needed for grid). */
function runPack(): ReturnType<typeof packUnitsGreedy> {
  return state.packParams.placementMode === "grid"
    ? packUnitsGrid(state.host, state.hostParams.k, state.units, state.packParams, state.cloudPrototypes)
    : packUnitsGreedy(state.host, state.hostParams.k, state.units, state.packParams, state.cloudPrototypes);
}

/** T14: raymarch capacity is exceeded when EITHER budget (flat ball array,
 * unit slice array) is exhausted — see shaders.ts's two caps. */
function raymarchOverCapacity(): boolean {
  return totalUnitBalls() > VOID_MAX_BALLS || state.units.length > VOID_MAX_UNITS;
}

function regrowHost(): void {
  record(history, state, "growHost", { params: { ...state.hostParams } });
  selectedUnitId = null;
  afterMutation();
}

// --- UI ------------------------------------------------------------------
const ui = buildUi(app, state.hostParams, state.packParams, state.mode, manifest.version, manifest.updatedAt, {
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
    selectedUnitId = null;
    ui.syncHostParams(state.hostParams);
    afterMutation();
  },
  onImportS1File: (file) => importS1Recipe(file),
  onPackParamChange: (key, value) => {
    record(history, state, "setPackParam", { key, value });
    afterMutation({ skipGauges: true });
  },
  onSetMode: (mode) => {
    record(history, state, "setMode", { mode });
    ui.setMode(state.mode);
    // Void bead color depends on mode (T13 §3) -- rebuild beads so a mode
    // flip while already viewing beads updates their color immediately.
    packRenderer.updateBeads(state.host, state.units, state.mode, selectedUnitId);
    render();
  },
  // T14 §1: 詰める単位の切替. Recorded as an ordinary setPackParam so history
  // export/import reproduces it without a new op shape.
  onSetUnitKind: (kind) => {
    record(history, state, "setPackParam", { key: "unitKind", value: kind });
    ui.setUnitKind(state.packParams.unitKind);
    afterMutation({ skipGauges: true });
  },
  // T15 §2: switch placement mode (recorded as an ordinary setPackParam, same
  // "reuse the generic op" convention T14's unit-kind toggle already set).
  onSetPlacementMode: (mode) => {
    record(history, state, "setPackParam", { key: "placementMode", value: mode });
    ui.setPlacementMode(state.packParams.placementMode);
    afterMutation({ skipGauges: true });
  },
  onImportPrototypeFile: (file) => importPrototype(file),
  onSetViewMode: (mode) => setViewMode(mode),
  onPackUnits: () => {
    const result = runPack();
    lastPackResult = result;
    record(history, state, "packUnits", { units: result.units });
    afterMutation();
  },
  onClearVoids: () => {
    record(history, state, "clearVoids", {});
    selectedUnitId = null;
    lastPackResult = null;
    afterMutation();
  },
  onClearAll: () => {
    record(history, state, "clearAll", {});
    selectedUnitId = null;
    lastPackResult = null;
    afterMutation();
  },
  onToggleAddVoidMode: (active) => {
    addUnitMode = active;
    viewport.classList.toggle("add-void-mode", active);
    ui.setAddVoidModeActive(active);
  },
  onManualRadiusChange: (r) => {
    manualRadius = r;
  },
  onDeleteSelectedUnit: () => deleteSelectedUnit(),
  onExport: () => exportHistory(),
  onImportFile: (file) => importHistory(file),
  onMeshInspect: (options) => inspectMesh(options),
  onMeshExport: (options) => exportMesh(options),
});
ui.setMode(state.mode);
ui.setUnitKind(state.packParams.unitKind);
ui.setPrototypeInfo(state.cloudPrototypes.length);
packRenderer.resize();
afterMutation();

// --- Pointer interaction ---------------------------------------------------
// Click (no drag) on a unit -> select it (toggle). Click on host skin while
// "add unit" mode is active -> place a manual unit there. No dragging (see
// file header). Same click/orbit disambiguation pattern as cloud-sculpt.

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
  const ray = packRenderer.screenToRay(x, y);

  if (addUnitMode) {
    const hit = raymarchHost(state.host, state.hostParams.k, ray.origin, ray.dir);
    if (!hit) return;
    // Push the center inward along the inverse surface normal so the
    // manual unit actually carves into the host, not just kisses its skin.
    const center = new THREE.Vector3()
      .copy(hit.point)
      .addScaledVector(hit.normal, -manualRadius * 0.5);
    // T14: build a unit of the CURRENT kind (球/雲) at the clicked spot. The
    // rng seed folds in the current ball count so consecutive manual cloud
    // adds differ (same "続きの列" discipline as the packer); the concrete
    // resulting unit is what gets recorded (addUnit carries the RESULT), so
    // replay never re-rolls this rng.
    const rng = makeRng(hashSeed(`${state.packParams.seed}#manual#${totalUnitBalls()}`));
    const unit = buildUnit(
      state.packParams.unitKind,
      { x: center.x, y: center.y, z: center.z },
      manualRadius,
      state.packParams,
      state.cloudPrototypes,
      rng,
    );
    record(history, state, "addUnit", { unit });
    selectedUnitId = unit.id;
    afterMutation();
    return;
  }

  const hit = raymarchComposite(state.mode, state.host, state.hostParams.k, state.units, state.packParams.roundK, ray.origin, ray.dir);
  if (hit && hit.unitIndex >= 0) {
    const u = state.units[hit.unitIndex];
    selectedUnitId = u.id === selectedUnitId ? null : u.id;
  } else {
    selectedUnitId = null;
  }
  // Cheap re-color only (no rebuild) -- keeps the bead view's selection in
  // sync even though this path deliberately skips the full afterMutation()
  // (picking doesn't change host/units), mirroring skin/main.ts's identical
  // handleClick path.
  packRenderer.updateBeadSelection(selectedUnitId);
  updateSelectionLabel();
  render();
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    if (document.activeElement?.tagName === "INPUT") return; // don't eat text-field edits
    deleteSelectedUnit();
  }
});

function deleteSelectedUnit(): void {
  if (selectedUnitId === null) return;
  record(history, state, "removeUnit", { id: selectedUnitId });
  selectedUnitId = null;
  afterMutation();
}

function updateSelectionLabel(): void {
  const u = selectedUnitId === null ? null : state.units.find((u) => u.id === selectedUnitId) ?? null;
  // T13/T14: these are raymarch-only limits (GLSL uniform-array budgets --
  // shaders.ts's HOST_MAX_BALLS/VOID_MAX_BALLS/VOID_MAX_UNITS). Beads and
  // the full-mesh view have no such cap, so showing this warning there
  // would be dishonest (AGENTS §6) -- mirrors skin/main.ts's viewMode gate.
  const isRaymarch = viewMode === "raymarch";
  const balls = totalUnitBalls();
  const hostCap =
    isRaymarch && state.host.length > HOST_MAX_BALLS
      ? ` ⚠ 画面はホスト最初の${HOST_MAX_BALLS}球のみ表示（全${state.host.length}球はSTL/検査には含まれる）`
      : "";
  const voidCap =
    isRaymarch && raymarchOverCapacity()
      ? ` ⚠ 画面は先頭の単位のみ表示（容量: 球${VOID_MAX_BALLS}/単位${VOID_MAX_UNITS}。全 単位${state.units.length}・球${balls} はSTL/検査には含まれる。「ビーズ」表示に切り替えると全量が見えます）`
      : "";
  const KIND_LABEL: Record<string, string> = { sphere: "球", cloud: "雲", coin: "コイン", flatRing: "平リング", ring3d: "立体リング" };
  const kindLabel = u ? (KIND_LABEL[u.kind] ?? u.kind) : "";
  const selText = u
    ? `選択中: 単位 #${u.id} (${kindLabel}・球${u.balls.length}個, 外接r=${u.outerRadius.toFixed(3)})`
    : "選択なし";
  ui.setSelectionInfo(selText + hostCap + voidCap);
  ui.setCounts(state.host.length, state.units.length, balls);
}

// --- History export / import ----------------------------------------------

function exportHistory(): void {
  const json = serializeRecipe(history);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `pack-recipe-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function applyRecipeText(text: string): void {
  const entries = parseRecipe(text);
  history = entries;
  state = replay(entries);
  selectedUnitId = null;
  lastPackResult = null;
  ui.syncHostParams(state.hostParams);
  ui.syncPackParams(state.packParams);
  ui.setMode(state.mode);
  ui.setUnitKind(state.packParams.unitKind);
  const lastProto = state.cloudPrototypes[state.cloudPrototypes.length - 1];
  ui.setPrototypeInfo(state.cloudPrototypes.length, lastProto?.source);
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

// T14 §2: register an S1 recipe as a unit origin shape (詰め材).
async function importPrototype(file: File): Promise<void> {
  try {
    const text = await file.text();
    const { balls, k } = loadCloudPrototypeFromS1Recipe(text);
    record(history, state, "loadCloudPrototype", { balls, k, source: file.name });
    ui.setPrototypeInfo(state.cloudPrototypes.length, file.name);
    // Registering a prototype implies the author wants cloud units next —
    // switch the kind if still on "sphere" (one less silent no-op where a
    // freshly loaded prototype appears to do nothing). Recorded as a normal
    // setPackParam so replay reproduces the same convenience.
    if (state.packParams.unitKind !== "cloud") {
      const kind: UnitKind = "cloud";
      record(history, state, "setPackParam", { key: "unitKind", value: kind });
      ui.setUnitKind(state.packParams.unitKind);
    }
    afterMutation({ skipGauges: true });
  } catch (err) {
    alert(`S1 レシピ（原型）の読み込みに失敗しました: ${(err as Error).message}`);
  }
}

function inspectMesh(options: MeshUiOptions): void {
  try {
    ui.setMeshStatus("検査中...");
    const result = buildPackMesh(state.mode, state.host, state.hostParams.k, state.units, state.packParams.roundK, options);
    ui.setMeshStatus(meshSummary(result), result.watertight.ok);
  } catch (err) {
    ui.setMeshStatus(`検査失敗: ${(err as Error).message}`, false);
  }
}

function exportMesh(options: MeshUiOptions): void {
  try {
    ui.setMeshStatus("書き出し準備中...");
    const result = buildPackMesh(state.mode, state.host, state.hostParams.k, state.units, state.packParams.roundK, options);
    ui.setMeshStatus(meshSummary(result), result.watertight.ok);
    downloadPackMeshBundle(result, history, makePackExportBaseName(state.mode));
  } catch (err) {
    ui.setMeshStatus(`書き出し失敗: ${(err as Error).message}`, false);
  }
}

// --- Gauges -----------------------------------------------------------
// Computed on-demand after state mutations (not every animation frame --
// estimateFillRatio's Monte Carlo pass and the O(units^2) wall scan are not
// free) so FPS stays governed by the raymarch cost alone.

function refreshGauges(): void {
  const wall = estimateThinnestWall(state.host, state.hostParams.k, state.units);
  const fill = estimateFillRatio(state.host, state.hostParams.k, state.units);
  const bounds = state.host.length > 0 ? computeSamplingBounds(state.host, state.hostParams.k) : null;
  const { targetLongestMm } = ui.getMeshOptions();
  const mmPerUnit = bounds && bounds.longest > 0 ? targetLongestMm / bounds.longest : 1;
  ui.setGauges(wall, fill, mmPerUnit);
}

/** Switch the active view. "mesh" (re)builds the true marching-tets geometry
 * on demand (expensive, so only ever done here). "beads" assumes
 * packRenderer's InstancedMeshes are already current (afterMutation() keeps
 * them in sync); switching TO beads here still rebuilds once so a manual
 * click right after a packParam-only change (which skips the bead rebuild,
 * see afterMutation's skipGauges branch) shows current data. Ported from
 * skin/main.ts's identical setViewMode. */
function setViewMode(mode: PackViewMode): void {
  viewMode = mode;
  if (mode === "mesh") {
    try {
      const opts = ui.getMeshOptions();
      const mesh = buildPackMesh(state.mode, state.host, state.hostParams.k, state.units, state.packParams.roundK, {
        resolution: Math.min(opts.resolution, 128),
        targetLongestMm: opts.targetLongestMm,
      });
      packRenderer.setMeshOverlay(mesh.triangles);
    } catch (err) {
      alert(`全体メッシュの生成に失敗しました: ${(err as Error).message}`);
      viewMode = "raymarch";
    }
  } else if (mode === "beads") {
    packRenderer.updateBeads(state.host, state.units, state.mode, selectedUnitId);
  }
  packRenderer.setViewMode(viewMode);
  ui.setViewMode(viewMode, state.units.length, totalUnitBalls());
}

function afterMutation(opts: { skipGauges?: boolean } = {}): void {
  ui.setHistoryCount(history.length);
  ui.setPackResult(lastPackResult);
  if (viewMode === "mesh") {
    // Any mutation invalidates the cached triangle soup -- don't leave a
    // stale mesh on screen (skin's T11 rule, ported verbatim).
    packRenderer.setMeshOverlay(null);
    viewMode = raymarchOverCapacity() ? "beads" : "raymarch";
  }
  if (!opts.skipGauges) {
    // Bead geometry only needs rebuilding when host/units actually changed --
    // packParam slider drags call afterMutation({skipGauges: true}) precisely
    // because they don't touch host/units yet (only the next "詰める" does).
    packRenderer.updateBeads(state.host, state.units, state.mode, selectedUnitId);
    // T13 §3 "自動切替", T14: fires when EITHER the flat ball budget or the
    // unit budget is exceeded (cloud units hit the ball budget ~3-10x
    // sooner, so this trigger matters much more than it did for spheres —
    // see README v0.3's threshold note). Only fires when currently ON raymarch.
    if (raymarchOverCapacity() && viewMode === "raymarch") {
      viewMode = "beads";
      ui.setAutoSwitchNotice(true);
    } else {
      ui.setAutoSwitchNotice(false);
    }
  }
  packRenderer.setViewMode(viewMode);
  ui.setViewMode(viewMode, state.units.length, totalUnitBalls());
  updateSelectionLabel();
  if (!opts.skipGauges) refreshGauges();
  render();
}

// Debug / verification handle (used by automated checks and the "same shape
// after import" test in README). Read state, or feed a recipe directly.
(window as unknown as Record<string, unknown>).__pack = {
  getHost: () => state.host.map((b) => ({ ...b })),
  getUnits: () =>
    state.units.map((u) => ({ ...u, center: { ...u.center }, balls: u.balls.map((b) => ({ ...b })), normal: u.normal ? { ...u.normal } : undefined })),
  /** Back-compat-shaped helper: every constituent ball, flattened. */
  getVoids: () => flattenUnits(state.units).map((b) => ({ ...b })),
  getPrototypes: () => state.cloudPrototypes.map((p) => ({ ...p, balls: p.balls.map((b) => ({ ...b })) })),
  getHostParams: () => ({ ...state.hostParams }),
  getPackParams: () => ({ ...state.packParams }),
  getHistory: () => history.map((e) => ({ ...e })),
  exportJson: () => serializeRecipe(history),
  importJson: (text: string) => applyRecipeText(text),
  packUnits: () => {
    const result = runPack();
    lastPackResult = result;
    record(history, state, "packUnits", { units: result.units });
    afterMutation();
    return { placed: result.placed, triedAndRejected: result.triedAndRejected, stoppedEarly: result.stoppedEarly };
  },
  setPackParam: (key: keyof PackParams, value: number | string) => {
    record(history, state, "setPackParam", { key, value });
    ui.syncPackParams(state.packParams);
    afterMutation({ skipGauges: true });
  },
  loadPrototypeJson: (text: string, source = "debug") => {
    const { balls, k } = loadCloudPrototypeFromS1Recipe(text);
    record(history, state, "loadCloudPrototype", { balls, k, source });
    ui.setPrototypeInfo(state.cloudPrototypes.length, source);
    afterMutation({ skipGauges: true });
    return state.cloudPrototypes.length;
  },
  selectUnit: (id: number | null) => {
    selectedUnitId = id;
    packRenderer.updateBeadSelection(selectedUnitId);
    updateSelectionLabel();
    render();
  },
  getSelectedUnitId: () => selectedUnitId,
  removeUnit: (id: number) => {
    record(history, state, "removeUnit", { id });
    if (selectedUnitId === id) selectedUnitId = null;
    afterMutation();
  },
  getMode: () => state.mode,
  setMode: (mode: "carve" | "fill") => {
    record(history, state, "setMode", { mode });
    ui.setMode(state.mode);
    packRenderer.updateBeads(state.host, state.units, state.mode, selectedUnitId);
    render();
  },
  getViewMode: () => viewMode,
  setViewMode: (mode: PackViewMode) => setViewMode(mode),
  inspectMesh: (options: MeshUiOptions) =>
    buildPackMesh(state.mode, state.host, state.hostParams.k, state.units, state.packParams.roundK, options),
  gauges: () => ({
    wall: estimateThinnestWall(state.host, state.hostParams.k, state.units),
    fill: estimateFillRatio(state.host, state.hostParams.k, state.units),
  }),
  // Direct render-cost measurement (ms/frame averaged over n calls),
  // bypassing requestAnimationFrame -- rAF is throttled/paused in a
  // backgrounded/automated tab (document.hidden), making the on-screen fps
  // counter unusable for verification there. Ported from skin/main.ts's
  // identical benchmarkRender.
  benchmarkRender: (n = 120) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      packRenderer.camera.position.x += Math.sin(i) * 0.001;
      packRenderer.render();
    }
    const ms = (performance.now() - t0) / n;
    return { msPerFrame: ms, fps: 1000 / ms, frames: n };
  },
};

// --- Render loop ------------------------------------------------------

function render(): void {
  packRenderer.update(state.host, state.hostParams.k, state.units, state.packParams.roundK, state.mode, selectedUnitId);
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
  packRenderer.render();
}

render();
tick();

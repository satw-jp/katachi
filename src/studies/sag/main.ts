// ---------------------------------------------------------------------------
// Sag (S2b) — entry point. Same wiring shape as S1/S2, plus: a deform cache
// (deform.ts) recomputed whenever the rest shape or softness changes (never
// every frame — T2b-sag.md §2), and picking that hit-tests the DEFORMED
// display but edits the REST state by matching ball id (T2b-sag.md §3).
// See README.md for Question/Setup/Observation.
// ---------------------------------------------------------------------------

import "./style.css";
import * as THREE from "three";
import manifest from "./manifest.json";
import { freshBallId } from "../cloud-sculpt/field.ts";
import { raymarchField } from "../cloud-sculpt/picking.ts";
import { computeStrain } from "../gravity/physics.ts";
import { DEFAULT_SAG_PARAMS } from "./params.ts";
import type { HistoryEntry } from "./history.ts";
import { createEmptyState, parseRecipe, record, replay, serializeRecipe } from "./history.ts";
import type { DeformResult } from "./deform.ts";
import { computeDeform } from "./deform.ts";
import { SagRenderer } from "./renderer.ts";
import { buildUi } from "./ui.ts";

const app = document.getElementById("app")!;
const viewport = document.createElement("div");
viewport.id = "viewport";
app.appendChild(viewport);

// --- State -------------------------------------------------------------
// state.balls is the 正本 (rest shape). `deformed` is a cached, purely
// derived recomputation of computeDeform(state.balls, state.params.softness)
// — never part of the history, never itself the source of truth.
let history: HistoryEntry[] = [];
let state = createEmptyState();
let selectedBallId: number | null = null;
let deformed: DeformResult = { balls: [], broken: [] };
let ghostEnabled = true;
let lastSoftnessResponseMs: number | null = null;

const sagRenderer = new SagRenderer(viewport);

// `ui` is assigned below (after buildUi()); recomputeDeform touches it, so
// it must never be called before that assignment runs (TDZ) — the initial
// deform pass happens after `const ui = buildUi(...)` further down.
function recomputeDeform(): void {
  deformed = computeDeform(state.balls, state.params.softness);
  ui.setBrokenNote(deformed.broken.filter(Boolean).length);
}

// Seed the initial cloud, same default field as S1/S2, so the screen opens
// with something to already see sag on (softness starts at 0 -> no sag yet).
record(history, state, "grow", { params: { ...DEFAULT_SAG_PARAMS } });

function regrowCurrentField(): void {
  record(history, state, "grow", { params: { ...state.params } });
  selectedBallId = null;
  recomputeDeform();
  ui.setHistoryCount(history.length);
  updateSelectionLabel();
  render();
}

// --- UI ------------------------------------------------------------------
const ui = buildUi(app, state.params, manifest.version, manifest.updatedAt, {
  onParamChange: (key, value) => {
    record(history, state, "setParam", { key, value });
    if (key === "k") {
      // Blend strength affects the field's look, not the rest positions or
      // the spring network's rest lengths -> no deform recompute needed.
      ui.setHistoryCount(history.length);
      render();
      return;
    }
    if (key === "softness") {
      const t0 = performance.now();
      recomputeDeform();
      ui.setHistoryCount(history.length);
      render();
      lastSoftnessResponseMs = performance.now() - t0;
      return;
    }
    // count / radiusBase / radiusSpread / seed regenerate the rest shape.
    regrowCurrentField();
  },
  onGrow: () => {
    regrowCurrentField();
  },
  onReroll: () => {
    const seed = Math.random().toString(36).slice(2, 8);
    record(history, state, "grow", { params: { ...state.params, seed } });
    selectedBallId = null;
    recomputeDeform();
    ui.syncParams(state.params);
    ui.setHistoryCount(history.length);
    updateSelectionLabel();
    render();
  },
  onClear: () => {
    record(history, state, "clear", {});
    selectedBallId = null;
    recomputeDeform();
    ui.setHistoryCount(history.length);
    updateSelectionLabel();
    render();
  },
  onDeleteSelected: () => deleteSelected(),
  onBallRadiusChange: (r) => {
    if (selectedBallId === null) return;
    record(history, state, "setBallRadius", { id: selectedBallId, r });
    recomputeDeform();
    ui.setHistoryCount(history.length);
    updateSelectionLabel();
    render();
  },
  onBallPositionChange: (axis, value) => {
    if (selectedBallId === null) return;
    const ball = state.balls.find((b) => b.id === selectedBallId);
    if (!ball) return;
    const next = { x: ball.x, y: ball.y, z: ball.z, [axis]: value };
    record(history, state, "moveBall", { id: ball.id, ...next });
    recomputeDeform();
    ui.setHistoryCount(history.length);
    render();
  },
  onGhostToggle: (enabled) => {
    ghostEnabled = enabled;
    render();
  },
  onFreeze: () => freezeNow(),
  onExport: () => exportHistory(),
  onImportFile: (file) => importHistory(file),
});
sagRenderer.resize();
recomputeDeform();
ui.setHistoryCount(history.length);

// --- Pointer interaction ---------------------------------------------------
// Same shape as S1/S2, but hit-tests the DEFORMED display (what's on
// screen) while all edits land on the REST state (state.balls), matched by
// ball id (T2b-sag.md §3: "ピッキングはたわんだ表示に対して行い、当たった
// 球の休み形を編集する（同じ id の球）").

let pointerDownPos: { x: number; y: number } | null = null;
let draggingBallId: number | null = null;
const DRAG_THRESHOLD = 4;

function ndcFromEvent(e: PointerEvent): { x: number; y: number } {
  const rect = viewport.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  return { x, y };
}

viewport.addEventListener("pointerdown", (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
  const { x, y } = ndcFromEvent(e);
  const ray = sagRenderer.screenToRay(x, y);
  const hit = raymarchField(deformed.balls, state.params.k, ray.origin, ray.dir);
  if (hit && hit.ballIndex >= 0) {
    const hitId = deformed.balls[hit.ballIndex].id;
    if (hitId === selectedBallId) {
      draggingBallId = hitId;
      sagRenderer.controls.enabled = false;
      viewport.classList.add("dragging-ball");
    }
  }
});

viewport.addEventListener("pointermove", (e) => {
  if (draggingBallId === null) return;
  const { x, y } = ndcFromEvent(e);
  const ray = sagRenderer.screenToRay(x, y);
  // Drag plane pivots on the ball's current DEFORMED (on-screen) position —
  // that's what the user is looking at and dragging — but the resulting
  // world point is written into the REST ball with the same id.
  const deformedBall = deformed.balls.find((b) => b.id === draggingBallId);
  const restBall = state.balls.find((b) => b.id === draggingBallId);
  if (!deformedBall || !restBall) return;
  const pivot = new THREE.Vector3(deformedBall.x, deformedBall.y, deformedBall.z);
  const planeNormal = new THREE.Vector3().subVectors(sagRenderer.camera.position, pivot).normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, pivot);
  const raycaster = new THREE.Raycaster(ray.origin, ray.dir);
  const target = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, target)) {
    record(history, state, "moveBall", { id: restBall.id, x: target.x, y: target.y, z: target.z });
    recomputeDeform();
    ui.setHistoryCount(history.length);
    updateSelectionLabel();
    render();
  }
});

window.addEventListener("pointerup", (e) => {
  const wasDragging = draggingBallId !== null;
  draggingBallId = null;
  sagRenderer.controls.enabled = true;
  viewport.classList.remove("dragging-ball");

  if (wasDragging) {
    pointerDownPos = null;
    return;
  }

  if (!pointerDownPos) return;
  const dx = e.clientX - pointerDownPos.x;
  const dy = e.clientY - pointerDownPos.y;
  pointerDownPos = null;
  if (Math.hypot(dx, dy) > DRAG_THRESHOLD) return;

  if (!isEventOnViewport(e)) return;
  handleClick(e);
});

function isEventOnViewport(e: PointerEvent): boolean {
  return (e.target as HTMLElement)?.closest?.("#viewport") != null;
}

function handleClick(e: PointerEvent): void {
  const { x, y } = ndcFromEvent(e);
  const ray = sagRenderer.screenToRay(x, y);
  const hit = raymarchField(deformed.balls, state.params.k, ray.origin, ray.dir);

  if (hit && hit.ballIndex >= 0) {
    const hitId = deformed.balls[hit.ballIndex].id;
    selectedBallId = hitId === selectedBallId ? null : hitId;
    updateSelectionLabel();
    render();
    return;
  }

  // Nothing hit: add a new ball directly into the REST state at the clicked
  // point (there is no deformed/rest distinction yet for a ball that didn't
  // exist a moment ago).
  const dist = deformed.balls.length > 0 ? approxCloudDistance() : 4;
  const point = new THREE.Vector3().copy(ray.origin).addScaledVector(ray.dir, dist);
  const newBall = {
    id: freshBallId(),
    x: point.x,
    y: point.y,
    z: point.z,
    r: state.params.radiusBase,
  };
  record(history, state, "addBall", newBall);
  selectedBallId = newBall.id;
  recomputeDeform();
  ui.setHistoryCount(history.length);
  updateSelectionLabel();
  render();
}

function approxCloudDistance(): number {
  const target = sagRenderer.controls.target;
  return sagRenderer.camera.position.distanceTo(target);
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    if (document.activeElement?.tagName === "INPUT") return;
    deleteSelected();
  }
});

// T2c: "凍らせる" (freeze) — bake the current deform into the rest shape and
// zero softness (history.ts's "freeze" case does the actual state mutation;
// this just records it and refreshes everything derived from state, same
// pattern as every other op here). Selection is intentionally left alone
// (ball ids survive freeze unchanged) so a selected ball stays selected and
// こねる can continue right where it left off (T2c-liquid-freeze.md §2,
// "凍らせた後もこねる操作は普通に続けられる"). syncParams IS needed (unlike
// the other handlers) because this op changes a param — softness — without
// the user having touched the softness slider themselves.
function freezeNow(): void {
  record(history, state, "freeze", {});
  recomputeDeform();
  ui.syncParams(state.params);
  ui.setHistoryCount(history.length);
  updateSelectionLabel();
  render();
}

function deleteSelected(): void {
  if (selectedBallId === null) return;
  record(history, state, "removeBall", { id: selectedBallId });
  selectedBallId = null;
  recomputeDeform();
  ui.setHistoryCount(history.length);
  updateSelectionLabel();
  render();
}

function updateSelectionLabel(): void {
  const ball = selectedBallId === null ? null : state.balls.find((b) => b.id === selectedBallId) ?? null;
  if (!ball) {
    ui.setSelectionInfo("選択なし");
  } else {
    const idx = state.balls.findIndex((b) => b.id === ball.id);
    const strain = computeStrain(deformed.balls);
    const s = idx >= 0 ? strain.normalized[idx] : 0;
    const broken = idx >= 0 && deformed.broken[idx];
    ui.setSelectionInfo(
      `選択中: 球 #${ball.id} (r=${ball.r.toFixed(2)}) — 苦しさ ${s.toFixed(2)}${broken ? "（壊れた）" : ""}`,
    );
  }
  ui.setBallEditor(ball);
}

// --- History export / import ----------------------------------------------

function exportHistory(): void {
  const json = serializeRecipe(history);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `sag-recipe-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function applyRecipeText(text: string): void {
  const entries = parseRecipe(text);
  history = entries;
  state = replay(entries);
  selectedBallId = null;
  recomputeDeform();
  ui.syncParams(state.params);
  ui.setHistoryCount(history.length);
  updateSelectionLabel();
  render();
}

async function importHistory(file: File): Promise<void> {
  try {
    applyRecipeText(await file.text());
  } catch (err) {
    alert(`履歴の読み込みに失敗しました: ${(err as Error).message}`);
  }
}

// Debug / verification handle (mirrors S1's __cloudSculpt, S2's __gravity).
(window as unknown as Record<string, unknown>).__sag = {
  /** 正本: the rest (休んでいる) balls — what's in the history. */
  getBalls: () => state.balls.map((b) => ({ ...b })),
  /** Derived: the deformed (たわんだ) balls — recomputed, never stored. */
  getDeformed: () => deformed.balls.map((b) => ({ ...b })),
  getBroken: () => [...deformed.broken],
  getParams: () => ({ ...state.params }),
  getHistory: () => history.map((e) => ({ ...e })),
  getStrain: () => computeStrain(deformed.balls),
  getLastSoftnessResponseMs: () => lastSoftnessResponseMs,
  isGhostEnabled: () => ghostEnabled,
  exportJson: () => serializeRecipe(history),
  importJson: (text: string) => applyRecipeText(text),
};

// --- Render loop ------------------------------------------------------

function render(): void {
  const strain = computeStrain(deformed.balls);
  const normalized = strain.normalized.map((v, i) => (deformed.broken[i] ? 1 : v));
  sagRenderer.updateMain(deformed.balls, state.params.k, normalized, selectedBallId);
  sagRenderer.updateGhost(state.balls, state.params.k);
  sagRenderer.ghostEnabled = ghostEnabled;
  sagRenderer.render();
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
  sagRenderer.render();
}

render();
updateSelectionLabel();
tick();

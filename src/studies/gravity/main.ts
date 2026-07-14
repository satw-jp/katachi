// ---------------------------------------------------------------------------
// Gravity (S2) — entry point. Same wiring shape as cloud-sculpt/main.ts
// (S1), plus: a ground plane, a "接地させる" op, and per-frame strain color
// derived from physics.ts. See README.md for Question/Setup/Observation.
// ---------------------------------------------------------------------------

import "./style.css";
import * as THREE from "three";
import manifest from "./manifest.json";
import { DEFAULT_FIELD_PARAMS, freshBallId } from "../cloud-sculpt/field.ts";
import { raymarchField } from "../cloud-sculpt/picking.ts";
import type { HistoryEntry } from "./history.ts";
import { createEmptyState, parseRecipe, record, replay, serializeRecipe } from "./history.ts";
import { computeStrain } from "./physics.ts";
import { GravityRenderer } from "./renderer.ts";
import { buildUi } from "./ui.ts";

const app = document.getElementById("app")!;
const viewport = document.createElement("div");
viewport.id = "viewport";
app.appendChild(viewport);

// --- State -------------------------------------------------------------
let history: HistoryEntry[] = [];
let state = createEmptyState();
let selectedBallId: number | null = null;

const gravityRenderer = new GravityRenderer(viewport);

// Seed the initial cloud, same default field as S1, so the screen opens
// with something to already read the strain of.
record(history, state, "grow", { params: { ...DEFAULT_FIELD_PARAMS } });

function regrowCurrentField(): void {
  record(history, state, "grow", { params: { ...state.params } });
  selectedBallId = null;
  ui.setHistoryCount(history.length);
  updateSelectionLabel();
  render();
}

// --- UI ------------------------------------------------------------------
const ui = buildUi(app, state.params, manifest.version, manifest.updatedAt, {
  onParamChange: (key, value) => {
    record(history, state, "setParam", { key, value });
    if (key !== "k") {
      regrowCurrentField();
      return;
    }
    ui.setHistoryCount(history.length);
    render();
  },
  onGrow: () => {
    regrowCurrentField();
  },
  onReroll: () => {
    const seed = Math.random().toString(36).slice(2, 8);
    record(history, state, "grow", { params: { ...state.params, seed } });
    selectedBallId = null;
    ui.syncParams(state.params);
    ui.setHistoryCount(history.length);
    updateSelectionLabel();
    render();
  },
  onClear: () => {
    record(history, state, "clear", {});
    selectedBallId = null;
    ui.setHistoryCount(history.length);
    updateSelectionLabel();
    render();
  },
  onDeleteSelected: () => deleteSelected(),
  onBallRadiusChange: (r) => {
    if (selectedBallId === null) return;
    record(history, state, "setBallRadius", { id: selectedBallId, r });
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
    ui.setHistoryCount(history.length);
    render();
  },
  onSnapToGround: () => {
    record(history, state, "snapToGround", {});
    ui.setHistoryCount(history.length);
    updateSelectionLabel();
    render();
  },
  onExport: () => exportHistory(),
  onImportFile: (file) => importHistory(file),
});
gravityRenderer.resize();
ui.setHistoryCount(history.length);

// --- Pointer interaction (identical shape to S1) ---------------------------

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
  const ray = gravityRenderer.screenToRay(x, y);
  const hit = raymarchField(state.balls, state.params.k, ray.origin, ray.dir);
  if (hit && hit.ballIndex >= 0) {
    const ball = state.balls[hit.ballIndex];
    if (ball.id === selectedBallId) {
      draggingBallId = ball.id;
      gravityRenderer.controls.enabled = false;
      viewport.classList.add("dragging-ball");
    }
  }
});

viewport.addEventListener("pointermove", (e) => {
  if (draggingBallId === null) return;
  const { x, y } = ndcFromEvent(e);
  const ray = gravityRenderer.screenToRay(x, y);
  const ball = state.balls.find((b) => b.id === draggingBallId);
  if (!ball) return;
  const planeNormal = new THREE.Vector3()
    .subVectors(gravityRenderer.camera.position, new THREE.Vector3(ball.x, ball.y, ball.z))
    .normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    planeNormal,
    new THREE.Vector3(ball.x, ball.y, ball.z),
  );
  const raycaster = new THREE.Raycaster(ray.origin, ray.dir);
  const target = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, target)) {
    record(history, state, "moveBall", { id: ball.id, x: target.x, y: target.y, z: target.z });
    ui.setHistoryCount(history.length);
    updateSelectionLabel();
    render();
  }
});

window.addEventListener("pointerup", (e) => {
  const wasDragging = draggingBallId !== null;
  draggingBallId = null;
  gravityRenderer.controls.enabled = true;
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
  const ray = gravityRenderer.screenToRay(x, y);
  const hit = raymarchField(state.balls, state.params.k, ray.origin, ray.dir);

  if (hit && hit.ballIndex >= 0) {
    const ball = state.balls[hit.ballIndex];
    selectedBallId = ball.id === selectedBallId ? null : ball.id;
    updateSelectionLabel();
    render();
    return;
  }

  const dist = state.balls.length > 0 ? approxCloudDistance() : 4;
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
  ui.setHistoryCount(history.length);
  updateSelectionLabel();
  render();
}

function approxCloudDistance(): number {
  const target = gravityRenderer.controls.target;
  return gravityRenderer.camera.position.distanceTo(target);
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    if (document.activeElement?.tagName === "INPUT") return;
    deleteSelected();
  }
});

function deleteSelected(): void {
  if (selectedBallId === null) return;
  record(history, state, "removeBall", { id: selectedBallId });
  selectedBallId = null;
  ui.setHistoryCount(history.length);
  updateSelectionLabel();
  render();
}

function updateSelectionLabel(): void {
  const ball =
    selectedBallId === null ? null : state.balls.find((b) => b.id === selectedBallId) ?? null;
  if (!ball) {
    ui.setSelectionInfo("選択なし");
  } else {
    const strain = computeStrain(state.balls);
    const idx = state.balls.findIndex((b) => b.id === ball.id);
    const s = idx >= 0 ? strain.normalized[idx] : 0;
    const island = idx >= 0 && strain.island[idx];
    ui.setSelectionInfo(
      `選択中: 球 #${ball.id} (r=${ball.r.toFixed(2)}) — 苦しさ ${s.toFixed(2)}${island ? "（宙に浮いた島）" : ""}`,
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
  a.download = `gravity-recipe-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function applyRecipeText(text: string): void {
  const entries = parseRecipe(text);
  history = entries;
  state = replay(entries);
  selectedBallId = null;
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

// Debug / verification handle, mirroring S1's window.__cloudSculpt.
(window as unknown as Record<string, unknown>).__gravity = {
  getBalls: () => state.balls.map((b) => ({ ...b })),
  getParams: () => ({ ...state.params }),
  getHistory: () => history.map((e) => ({ ...e })),
  getStrain: () => computeStrain(state.balls),
  exportJson: () => serializeRecipe(history),
  importJson: (text: string) => applyRecipeText(text),
};

// --- Render loop ------------------------------------------------------

function render(): void {
  const strain = computeStrain(state.balls);
  gravityRenderer.update(state.balls, state.params.k, strain.normalized, selectedBallId);
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
  gravityRenderer.render();
}

render();
updateSelectionLabel();
tick();

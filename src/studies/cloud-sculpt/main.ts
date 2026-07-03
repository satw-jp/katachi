// ---------------------------------------------------------------------------
// Cloud Sculpt (S1) — entry point. Wires field + history + renderer + UI.
// See README.md for Question/Setup/Observation/Hypothesis/Next.
// ---------------------------------------------------------------------------

import "./style.css";
import * as THREE from "three";
import manifest from "./manifest.json";
import { DEFAULT_FIELD_PARAMS, freshBallId } from "./field.ts";
import type { HistoryEntry } from "./history.ts";
import { createEmptyState, parseRecipe, record, replay, serializeRecipe } from "./history.ts";
import { CloudRenderer } from "./renderer.ts";
import { raymarchField } from "./picking.ts";
import { buildUi } from "./ui.ts";

const app = document.getElementById("app")!;
const viewport = document.createElement("div");
viewport.id = "viewport";
app.appendChild(viewport);

// --- State -------------------------------------------------------------
let history: HistoryEntry[] = [];
let state = createEmptyState();
let selectedBallId: number | null = null;

const cloudRenderer = new CloudRenderer(viewport);

// Seed the initial cloud so the app opens with something to look at
// (an empty field is a legitimate but uninteresting state).
record(history, state, "grow", { params: { ...DEFAULT_FIELD_PARAMS } });

// --- UI ------------------------------------------------------------------
const ui = buildUi(app, state.params, manifest.version, manifest.updatedAt, {
  onParamChange: (key, value) => {
    record(history, state, "setParam", { key, value });
    ui.setHistoryCount(history.length);
    render();
  },
  onGrow: () => {
    record(history, state, "grow", { params: { ...state.params } });
    selectedBallId = null;
    ui.setHistoryCount(history.length);
    updateSelectionLabel();
    render();
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
  onExport: () => exportHistory(),
  onImportFile: (file) => importHistory(file),
});
ui.setHistoryCount(history.length);

// --- Pointer interaction ---------------------------------------------------
// Click (no drag) on empty space -> add a ball at the surface hit point.
// Click on an existing ball -> select it.
// Drag while a ball is selected and the pointer starts on it -> move it.

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
  const ray = cloudRenderer.screenToRay(x, y);
  const hit = raymarchField(state.balls, state.params.k, ray.origin, ray.dir);
  if (hit && hit.ballIndex >= 0) {
    const ball = state.balls[hit.ballIndex];
    if (ball.id === selectedBallId) {
      draggingBallId = ball.id;
      cloudRenderer.controls.enabled = false;
      viewport.classList.add("dragging-ball");
    }
  }
});

viewport.addEventListener("pointermove", (e) => {
  if (draggingBallId === null) return;
  const { x, y } = ndcFromEvent(e);
  const ray = cloudRenderer.screenToRay(x, y);
  const ball = state.balls.find((b) => b.id === draggingBallId);
  if (!ball) return;
  // Move along the plane through the ball's current position, facing the camera.
  const planeNormal = new THREE.Vector3()
    .subVectors(cloudRenderer.camera.position, new THREE.Vector3(ball.x, ball.y, ball.z))
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
    render();
  }
});

window.addEventListener("pointerup", (e) => {
  const wasDragging = draggingBallId !== null;
  draggingBallId = null;
  cloudRenderer.controls.enabled = true;
  viewport.classList.remove("dragging-ball");

  if (wasDragging) {
    pointerDownPos = null;
    return;
  }

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
  const ray = cloudRenderer.screenToRay(x, y);
  const hit = raymarchField(state.balls, state.params.k, ray.origin, ray.dir);

  if (hit && hit.ballIndex >= 0) {
    const ball = state.balls[hit.ballIndex];
    selectedBallId = ball.id === selectedBallId ? null : ball.id;
    updateSelectionLabel();
    render();
    return;
  }

  // Nothing hit: add a new ball a fixed distance along the ray, in front of
  // the cloud's bounding sphere so it appears near what you're looking at.
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
  const target = cloudRenderer.controls.target;
  return cloudRenderer.camera.position.distanceTo(target);
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    if (document.activeElement?.tagName === "INPUT") return; // don't eat text-field edits
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
  if (selectedBallId === null) {
    ui.setSelectionInfo("選択なし");
  } else {
    const ball = state.balls.find((b) => b.id === selectedBallId);
    ui.setSelectionInfo(
      ball
        ? `選択中: 球 #${ball.id} (r=${ball.r.toFixed(2)})`
        : "選択なし",
    );
  }
}

// --- History export / import ----------------------------------------------

function exportHistory(): void {
  const json = serializeRecipe(history);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `cloud-sculpt-recipe-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importHistory(file: File): Promise<void> {
  try {
    const text = await file.text();
    const entries = parseRecipe(text);
    history = entries;
    state = replay(entries);
    selectedBallId = null;
    ui.syncParams(state.params);
    ui.setHistoryCount(history.length);
    updateSelectionLabel();
    render();
  } catch (err) {
    alert(`履歴の読み込みに失敗しました: ${(err as Error).message}`);
  }
}

// --- Render loop ------------------------------------------------------

function render(): void {
  cloudRenderer.update(state.balls, state.params.k, selectedBallId);
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
  cloudRenderer.render();
}

render();
updateSelectionLabel();
tick();

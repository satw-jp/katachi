// ---------------------------------------------------------------------------
// Ring Hand (S-rings / T8) — entry point. Wires the shared field (balls,
// smooth-min k, imported from cloud-sculpt) + the ring "unit" layer
// (ring.ts/history.ts) + the linking-number instrument (linking.ts) +
// renderer + UI. See README.md for Question/Setup/Observation/Hypothesis/Next.
// ---------------------------------------------------------------------------

import "./style.css";
import * as THREE from "three";
import { eventTargetsViewport, ndcFromPointer } from "../../lib/input.ts";
import { startFrameLoop } from "../../lib/loop.ts";
import manifest from "./manifest.json";
import { raymarchField } from "../cloud-sculpt/picking.ts";
import { MAX_BALLS } from "./shaders.ts";
import type { RingHistoryEntry } from "./history.ts";
import {
  DEFAULT_K,
  createEmptyRingsState,
  nextDefaultRecipe,
  parseRecipe,
  record,
  replay,
  serializeRecipe,
} from "./history.ts";
import { allPairLinking, findDeepOverlaps } from "./linking.ts";
import { buildRingsMesh, downloadRingsMeshBundle, downloadS1Recipe, meshSummary } from "./meshExport.ts";
import { RingsRenderer } from "./renderer.ts";
import type { RingRecipe, Vec3 } from "./ring.ts";
import { DEFAULT_RING_RECIPE, freshRingId, vNorm } from "./ring.ts";
import type { DragMode, MeshUiOptions } from "./ui.ts";
import { buildRingsUi } from "./ui.ts";

const app = document.getElementById("app")!;
const viewport = document.createElement("div");
viewport.id = "viewport";
app.appendChild(viewport);

// --- State -------------------------------------------------------------
let history: RingHistoryEntry[] = [];
let state = createEmptyRingsState();
state.k = DEFAULT_K;
let selectedRingId: number | null = null;
let dragMode: DragMode = "move";
let recipeDraft: RingRecipe = { ...DEFAULT_RING_RECIPE };

const ringsRenderer = new RingsRenderer(viewport);

// Seed with two rings threaded through each other, so the Study opens with
// something already demonstrating the point (絡み数 should read 1 at open).
seedInitialScene();

function seedInitialScene(): void {
  const ringA: RingRecipe = {
    ...DEFAULT_RING_RECIPE,
    center: { x: 0, y: 0, z: 0 },
    axis: { x: 0, y: 0, z: 1 },
    seed: "ring-1",
  };
  const ringB: RingRecipe = {
    ...DEFAULT_RING_RECIPE,
    center: { x: DEFAULT_RING_RECIPE.R, y: 0, z: 0 },
    axis: { x: 0, y: 1, z: 0 },
    seed: "ring-2",
  };
  addRingFromRecipe(ringA);
  addRingFromRecipe(ringB);
}

function addRingFromRecipe(recipe: RingRecipe): void {
  const ringId = freshRingId();
  record(history, state, "addRing", { ringId, recipe });
}

// --- UI --------------------------------------------------------------------
const ui = buildRingsUi(app, recipeDraft, state.k, manifest.version, manifest.updatedAt, {
  onAddRing: () => {
    const recipe = { ...recipeDraft };
    addRingFromRecipe(recipe);
    recipeDraft = nextDefaultRecipe(state.groups.length);
    ui.syncRecipeDraft(recipeDraft);
    refreshAll();
  },
  onRingRecipeFieldChange: (key, value) => {
    (recipeDraft as unknown as Record<string, unknown>)[key] = value;
  },
  onAxisPresetChange: (preset) => {
    const axes: Record<"x" | "y" | "z", Vec3> = {
      x: { x: 1, y: 0, z: 0 },
      y: { x: 0, y: 1, z: 0 },
      z: { x: 0, y: 0, z: 1 },
    };
    recipeDraft = { ...recipeDraft, axis: axes[preset] };
  },
  onKChange: (value) => {
    record(history, state, "setK", { value });
    refreshAll();
  },
  onSelectRing: (ringId) => {
    selectedRingId = ringId;
    refreshAll();
  },
  onDuplicateRing: (ringId) => {
    const source = state.groups.find((g) => g.id === ringId);
    if (!source) return;
    const newRingId = freshRingId();
    const offset = { x: source.recipe.R * 1.6, y: 0, z: 0 };
    record(history, state, "duplicateRing", { sourceRingId: ringId, newRingId, offset });
    selectedRingId = newRingId;
    refreshAll();
  },
  onDeleteRing: (ringId) => {
    record(history, state, "removeRing", { ringId });
    if (selectedRingId === ringId) selectedRingId = null;
    refreshAll();
  },
  onDragModeChange: (mode) => {
    dragMode = mode;
  },
  onRotateNudge: (axis, angleDeg) => {
    if (selectedRingId === null) return;
    const group = state.groups.find((g) => g.id === selectedRingId);
    if (!group) return;
    const axisVec: Vec3 =
      axis === "x" ? { x: 1, y: 0, z: 0 } : axis === "y" ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
    record(history, state, "rotateRing", {
      ringId: selectedRingId,
      axis: axisVec,
      angle: (angleDeg * Math.PI) / 180,
      pivot: { ...group.center },
    });
    refreshAll();
  },
  onClear: () => {
    record(history, state, "clear", {});
    selectedRingId = null;
    refreshAll();
  },
  onExport: () => exportHistory(),
  onImportFile: (file) => importHistory(file),
  onExportS1: () => downloadS1Recipe(state.balls),
  onMeshInspect: (options) => inspectMesh(options),
  onMeshExport: (options) => exportMesh(options),
});
ringsRenderer.resize();
refreshAll();

// --- Pointer interaction ---------------------------------------------------
// Click a ball -> select the ring it belongs to (click again -> deselect).
// Click empty space -> deselect.
// Drag starting on a ball of the selected ring -> move or rotate the whole
// ring, depending on the panel's move/rotate mode toggle.

let pointerDownPos: { x: number; y: number } | null = null;
let draggingRingId: number | null = null;
let dragLastPoint: THREE.Vector3 | null = null;
// The drag plane is fixed ONCE at pointerdown. Rebuilding it through the
// ring's moving center every frame feeds the previous frame's motion back
// into the next intersection (delta = points on two DIFFERENT planes),
// which compounds exponentially — a small drag sent the ring flying
// (author report, 2026-07-11).
let dragPlane: THREE.Plane | null = null;
let dragLastNdcX = 0;
const DRAG_THRESHOLD = 4;
const ROTATE_PIXELS_PER_RADIAN = 220;

function ownerRingId(ballId: number): number | null {
  const g = state.groups.find((grp) => grp.ballIds.includes(ballId));
  return g ? g.id : null;
}

viewport.addEventListener("pointerdown", (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
  const { x, y } = ndcFromPointer(e, viewport);
  const ray = ringsRenderer.screenToRay(x, y);
  const hit = raymarchField(state.balls, state.k, ray.origin, ray.dir);
  if (hit && hit.ballIndex >= 0) {
    const ball = state.balls[hit.ballIndex];
    const ringId = ownerRingId(ball.id);
    if (ringId !== null && ringId === selectedRingId) {
      draggingRingId = ringId;
      dragLastPoint = hit.point.clone();
      dragLastNdcX = x;
      const group = state.groups.find((g) => g.id === ringId);
      const anchor = group
        ? new THREE.Vector3(group.center.x, group.center.y, group.center.z)
        : hit.point.clone();
      dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3().subVectors(ringsRenderer.camera.position, anchor).normalize(),
        anchor,
      );
      // Anchor the drag reference ON the drag plane (not on the ball's
      // surface): the first pointermove otherwise measures a spurious
      // surface→plane projection jump (~one ball radius) before any real
      // mouse motion.
      {
        const onPlane = new THREE.Vector3();
        const rc = new THREE.Raycaster(ray.origin, ray.dir);
        if (rc.ray.intersectPlane(dragPlane, onPlane)) dragLastPoint = onPlane.clone();
      }
      ringsRenderer.controls.enabled = false;
      viewport.classList.add("dragging-ball");
    }
  }
});

viewport.addEventListener("pointermove", (e) => {
  if (draggingRingId === null) return;
  const group = state.groups.find((g) => g.id === draggingRingId);
  if (!group) return;
  const { x, y } = ndcFromPointer(e, viewport);
  const ray = ringsRenderer.screenToRay(x, y);

  if (dragMode === "move") {
    if (!dragPlane) return;
    const raycaster = new THREE.Raycaster(ray.origin, ray.dir);
    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, target) && dragLastPoint) {
      const dx = target.x - dragLastPoint.x;
      const dy = target.y - dragLastPoint.y;
      const dz = target.z - dragLastPoint.z;
      if (dx !== 0 || dy !== 0 || dz !== 0) {
        record(history, state, "moveRing", { ringId: draggingRingId, dx, dy, dz });
        dragLastPoint = target.clone();
        refreshAll();
      }
    }
  } else {
    // Rotate mode: horizontal mouse movement rotates the ring around the
    // camera's current view (up) axis, pivoted at the ring's own center —
    // a simple, mouse-only way to spin a ring through another one.
    const deltaPixels = (x - dragLastNdcX) * (viewport.clientWidth / 2);
    const angle = deltaPixels / ROTATE_PIXELS_PER_RADIAN;
    if (Math.abs(angle) > 1e-5) {
      const viewAxis = vNorm({
        x: ringsRenderer.camera.up.x,
        y: ringsRenderer.camera.up.y,
        z: ringsRenderer.camera.up.z,
      });
      record(history, state, "rotateRing", {
        ringId: draggingRingId,
        axis: viewAxis,
        angle,
        pivot: { ...group.center },
      });
      dragLastNdcX = x;
      refreshAll();
    }
  }
});

window.addEventListener("pointerup", (e) => {
  const wasDragging = draggingRingId !== null;
  draggingRingId = null;
  dragLastPoint = null;
  dragPlane = null;
  ringsRenderer.controls.enabled = true;
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

  if (!eventTargetsViewport(e, viewport)) return;
  handleClick(e);
});

function handleClick(e: PointerEvent): void {
  const { x, y } = ndcFromPointer(e, viewport);
  const ray = ringsRenderer.screenToRay(x, y);
  const hit = raymarchField(state.balls, state.k, ray.origin, ray.dir);

  if (hit && hit.ballIndex >= 0) {
    const ball = state.balls[hit.ballIndex];
    const ringId = ownerRingId(ball.id);
    selectedRingId = ringId === selectedRingId ? null : ringId;
    refreshAll();
    return;
  }
  selectedRingId = null;
  refreshAll();
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    if (document.activeElement?.tagName === "INPUT") return;
    if (selectedRingId === null) return;
    record(history, state, "removeRing", { ringId: selectedRingId });
    selectedRingId = null;
    refreshAll();
  }
});

// --- History export / import ----------------------------------------------

function exportHistory(): void {
  const json = serializeRecipe(history);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `rings-recipe-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function applyRecipeText(text: string): void {
  const entries = parseRecipe(text);
  history = entries;
  state = replay(entries);
  selectedRingId = null;
  refreshAll();
}

async function importHistory(file: File): Promise<void> {
  try {
    applyRecipeText(await file.text());
  } catch (err) {
    alert(`履歴の読み込みに失敗しました: ${(err as Error).message}`);
  }
}

function inspectMesh(options: MeshUiOptions): void {
  try {
    ui.setMeshStatus("検査中...");
    const result = buildRingsMesh(state.balls, state.k, options);
    ui.setMeshStatus(meshSummary(result), result.watertight.ok);
  } catch (err) {
    ui.setMeshStatus(`検査失敗: ${(err as Error).message}`, false);
  }
}

function exportMesh(options: MeshUiOptions): void {
  try {
    ui.setMeshStatus("書き出し準備中...");
    const result = buildRingsMesh(state.balls, state.k, options);
    ui.setMeshStatus(meshSummary(result), result.watertight.ok);
    downloadRingsMeshBundle(result, state.balls);
  } catch (err) {
    ui.setMeshStatus(`書き出し失敗: ${(err as Error).message}`, false);
  }
}

// --- Refresh / render --------------------------------------------------

function refreshAll(): void {
  ui.setHistoryCount(history.length);
  ui.setBallCount(state.balls.length, MAX_BALLS);
  ui.setRings(state.groups, selectedRingId);
  const ballsById = new Map(state.balls.map((b) => [b.id, b]));
  ui.setLinking(allPairLinking(state.groups, ballsById), findDeepOverlaps(state.groups, ballsById));
  render();
}

function render(): void {
  const selected = state.groups.find((g) => g.id === selectedRingId);
  const highlighted = new Set<number>(selected ? selected.ballIds : []);
  ringsRenderer.update(state.balls, state.k, highlighted);
}

// Debug / verification handle (used by automated checks and the "same shape
// + same groups after import" test in the README).
(window as unknown as Record<string, unknown>).__rings = {
  /** Exposes the render camera/canvas for verification tooling (project a world point to a click pixel). Not used by the app itself. */
  camera: ringsRenderer.camera,
  canvas: () => viewport.querySelector("canvas"),
  getBalls: () => state.balls.map((b) => ({ ...b })),
  getGroups: () => state.groups.map((g) => ({ ...g, ballIds: [...g.ballIds] })),
  getK: () => state.k,
  getHistory: () => history.map((e) => ({ ...e })),
  exportJson: () => serializeRecipe(history),
  importJson: (text: string) => applyRecipeText(text),
  getLinking: () => {
    const ballsById = new Map(state.balls.map((b) => [b.id, b]));
    return allPairLinking(state.groups, ballsById);
  },
  getOverlapWarnings: () => {
    const ballsById = new Map(state.balls.map((b) => [b.id, b]));
    return findDeepOverlaps(state.groups, ballsById);
  },
  selectRing: (ringId: number | null) => {
    selectedRingId = ringId;
    refreshAll();
  },
  moveRing: (ringId: number, dx: number, dy: number, dz: number) => {
    record(history, state, "moveRing", { ringId, dx, dy, dz });
    refreshAll();
  },
  rotateRing: (ringId: number, axis: Vec3, angle: number, pivot?: Vec3) => {
    const group = state.groups.find((g) => g.id === ringId);
    record(history, state, "rotateRing", {
      ringId,
      axis,
      angle,
      pivot: pivot ?? (group ? { ...group.center } : { x: 0, y: 0, z: 0 }),
    });
    refreshAll();
  },
  inspectMesh: (options: MeshUiOptions) => buildRingsMesh(state.balls, state.k, options),
};

// --- Render loop ------------------------------------------------------

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
  ringsRenderer.render();
}

render();
startFrameLoop(renderFrame);

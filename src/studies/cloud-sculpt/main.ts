// ---------------------------------------------------------------------------
// Cloud Sculpt (S1) — entry point. Wires field + history + renderer + UI.
// See README.md for Question/Setup/Observation/Hypothesis/Next.
// ---------------------------------------------------------------------------

import "./style.css";
import * as THREE from "three";
import { eventTargetsViewport, ndcFromPointer } from "../../lib/input.ts";
import {
  parseHikariCase,
  serializeHikariCase,
  type CameraRecord,
} from "../../lib/hikari/index.ts";
import { startFrameLoop } from "../../lib/loop.ts";
import manifest from "./manifest.json";
import { DEFAULT_FIELD_PARAMS, freshBallId } from "./field.ts";
import {
  DEFAULT_HIKARI_SETTINGS,
  HikariLayer,
  normalizeHikariSettings,
  type HikariSettings,
  type WorkspaceView,
} from "./hikari.ts";
import { createCloudHikariShape } from "./hikariAdapter.ts";
import {
  createCloudHikariCase,
  restoreCloudHikariCase,
} from "./hikariCaseAdapter.ts";
import type { HistoryEntry } from "./history.ts";
import { createEmptyState, parseRecipe, record, replay, serializeRecipe } from "./history.ts";
import { buildCloudMesh, downloadMeshBundle, meshSummary } from "./meshExport.ts";
import { CloudRenderer } from "./renderer.ts";
import { raymarchField } from "./picking.ts";
import { MAX_BALLS } from "./shaders.ts";
import { HikariMpmDriver } from "./hikariMpmDriver.ts";
import type { MeshExportUiOptions } from "./ui.ts";
import { buildUi } from "./ui.ts";

const app = document.getElementById("app")!;
const viewport = document.createElement("div");
viewport.id = "viewport";
app.appendChild(viewport);

// --- State -------------------------------------------------------------
let history: HistoryEntry[] = [];
let state = createEmptyState();
let selectedBallId: number | null = null;
const HIKARI_SETTINGS_KEY = "katachi-cloud-sculpt-hikari-v1";
const WORKSPACE_VIEW_KEY = "katachi-cloud-sculpt-view-v1";
let workspaceView: WorkspaceView = resolveInitialWorkspaceView();
let hikariSettings = loadHikariSettings();
const safeModeQuery = new URLSearchParams(window.location.search).get("safe");
const windowsCompatibilityMode =
  safeModeQuery === "1"
  || (safeModeQuery !== "0" && /Windows/i.test(navigator.userAgent));

const cloudRenderer = new CloudRenderer(viewport, {
  compatibilityMode: windowsCompatibilityMode,
});
const hikariLayer = new HikariLayer(cloudRenderer.scene, {
  disableWebGpu: windowsCompatibilityMode,
  onCausticField: (field) => cloudRenderer.setCausticField(field),
});
const hikariMpmDriver = new HikariMpmDriver();
let hikariMpmActive = false;
let hikariMpmLastStepAt = 0;

// Seed the initial cloud so the app opens with something to look at
// (an empty field is a legitimate but uninteresting state).
record(history, state, "grow", { params: { ...DEFAULT_FIELD_PARAMS } });

function regrowCurrentField(): void {
  record(history, state, "grow", { params: { ...state.params } });
  selectedBallId = null;
  ui.setHistoryCount(history.length);
  updateSelectionLabel();
  render();
}

// --- UI ------------------------------------------------------------------
const ui = buildUi(
  app,
  state.params,
  manifest.version,
  manifest.updatedAt,
  workspaceView,
  hikariSettings,
  {
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
  onExport: () => exportHistory(),
  onImportFile: (file) => importHistory(file),
  onMeshInspect: (options) => inspectMesh(options),
  onMeshExport: (options) => exportMesh(options),
  onViewChange: (view) => {
    workspaceView = view;
    localStorage.setItem(WORKSPACE_VIEW_KEY, view);
    applyWorkspaceView();
  },
  onHikariChange: (settings) => {
    hikariSettings = normalizeHikariSettings(settings);
    localStorage.setItem(HIKARI_SETTINGS_KEY, JSON.stringify(hikariSettings));
    render();
  },
  onHikariCaseExport: () => exportHikariCase(),
  onHikariCaseImportFile: (file) => void importHikariCase(file),
  },
);

const mpmRow = document.createElement("div");
mpmRow.className = "row";
const mpmStartButton = document.createElement("button");
mpmStartButton.type = "button";
mpmStartButton.textContent = "MPM形態変形を開始";
const mpmStopButton = document.createElement("button");
mpmStopButton.type = "button";
mpmStopButton.textContent = "止めてこの形を採用";
mpmStopButton.disabled = true;
mpmRow.append(mpmStartButton, mpmStopButton);
const mpmStatus = document.createElement("div");
mpmStatus.className = "hint";
mpmStatus.textContent = "MPMは低頻度の球プロキシとしてHikariへ渡します。近似形状です。";
ui.root.append(mpmRow, mpmStatus);

mpmStartButton.onclick = () => {
  if (state.balls.length === 0) return;
  try {
    hikariMpmDriver.seed(state.balls, state.params.k);
    hikariMpmActive = true;
    hikariMpmLastStepAt = 0;
    workspaceView = "hikari";
    applyWorkspaceView();
    mpmStartButton.disabled = true;
    mpmStopButton.disabled = false;
    mpmStatus.textContent = hikariMpmDriver.description() + " · 再生中";
  } catch (error) {
    mpmStatus.textContent = `MPM開始失敗: ${(error as Error).message}`;
  }
};

mpmStopButton.onclick = () => {
  if (!hikariMpmActive) return;
  hikariMpmActive = false;
  const preview = hikariMpmDriver.previewBalls();
  if (preview.length > 0) {
    // Commit the chosen proxy as an explicit sculpt snapshot so subsequent
    // Hikari case export/reopen still passes the recipe/hash check.
    record(history, state, "clear", {});
    for (const ball of preview) record(history, state, "addBall", ball);
    selectedBallId = null;
    ui.setHistoryCount(history.length);
    updateSelectionLabel();
    render();
  }
  mpmStartButton.disabled = false;
  mpmStopButton.disabled = true;
  mpmStatus.textContent = `MPM形態を採用しました · ${preview.length}球の近似形状`;
};
cloudRenderer.resize();
ui.setHistoryCount(history.length);
applyWorkspaceView();

// --- Pointer interaction ---------------------------------------------------
// Click (no drag) on empty space -> add a ball at the surface hit point.
// Click on an existing ball -> select it.
// Drag while a ball is selected and the pointer starts on it -> move it.

let pointerDownPos: { x: number; y: number } | null = null;
let draggingBallId: number | null = null;
const DRAG_THRESHOLD = 4;

viewport.addEventListener("pointerdown", (e) => {
  if (workspaceView !== "katachi") return;
  pointerDownPos = { x: e.clientX, y: e.clientY };
  const { x, y } = ndcFromPointer(e, viewport);
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
  if (workspaceView !== "katachi") return;
  if (draggingBallId === null) return;
  const { x, y } = ndcFromPointer(e, viewport);
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
    updateSelectionLabel(); // keep the X/Y/Z fields in sync while dragging
    render();
  }
});

window.addEventListener("pointerup", (e) => {
  if (workspaceView !== "katachi") {
    pointerDownPos = null;
    draggingBallId = null;
    return;
  }
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

  if (!eventTargetsViewport(e, viewport)) return;
  handleClick(e);
});

function handleClick(e: PointerEvent): void {
  const { x, y } = ndcFromPointer(e, viewport);
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
  if (workspaceView !== "katachi") return;
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
  const ball =
    selectedBallId === null ? null : state.balls.find((b) => b.id === selectedBallId) ?? null;
  const capNote =
    state.balls.length > MAX_BALLS
      ? ` ⚠ 画面は最初の${MAX_BALLS}球のみ表示（全${state.balls.length}球はSTL/検査には含まれる）`
      : "";
  ui.setSelectionInfo((ball ? `選択中: 球 #${ball.id} (r=${ball.r.toFixed(2)})` : "選択なし") + capNote);
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
  a.download = `cloud-sculpt-recipe-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportHikariCase(): void {
  try {
    const stamp = new Date().toISOString();
    const compute = hikariLayer.getOpticsComputeStatus();
    const value = createCloudHikariCase({
      id: `cloud-hikari-${stamp.replace(/[:.]/g, "-")}`,
      capturedAtUtc: stamp,
      appVersion: manifest.version,
      balls: state.balls,
      smoothK: state.params.k,
      history,
      settings: hikariSettings,
      camera: currentCameraRecord(),
      rendererBackend: compute.kind === "webgpu" || compute.kind === "computing" ? "webgpu" : "cpu",
    });
    downloadJson(
      serializeHikariCase(value),
      `hikari-case-${stamp.replace(/[:.]/g, "-")}.hikari.json`,
    );
    ui.setHikariCaseStatus("観察ケースを保存しました。物理寸法は未校正として記録されています。", true);
  } catch (error) {
    ui.setHikariCaseStatus(`観察ケースを保存できません: ${(error as Error).message}`, false);
  }
}

async function importHikariCase(file: File): Promise<void> {
  try {
    const restored = restoreCloudHikariCase(parseHikariCase(await file.text()));
    history = restored.history;
    state = restored.state;
    hikariSettings = restored.settings;
    selectedBallId = null;
    workspaceView = "hikari";
    localStorage.setItem(HIKARI_SETTINGS_KEY, JSON.stringify(hikariSettings));
    localStorage.setItem(WORKSPACE_VIEW_KEY, workspaceView);
    ui.syncParams(state.params);
    ui.syncHikari(hikariSettings);
    ui.setHistoryCount(history.length);
    updateSelectionLabel();
    applyCameraRecord(restored.camera);
    applyWorkspaceView();
    ui.setHikariCaseStatus("観察ケースを開き、形・履歴・光・視点を復元しました。", true);
  } catch (error) {
    ui.setHikariCaseStatus(`観察ケースを開けません: ${(error as Error).message}`, false);
  }
}

function currentCameraRecord(): CameraRecord {
  const camera = cloudRenderer.camera;
  const target = cloudRenderer.controls.target;
  return {
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    target: { x: target.x, y: target.y, z: target.z },
    up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
    fovYDeg: camera.fov,
    near: camera.near,
    far: camera.far,
  };
}

function applyCameraRecord(value: CameraRecord): void {
  const camera = cloudRenderer.camera;
  camera.position.set(value.position.x, value.position.y, value.position.z);
  camera.up.set(value.up.x, value.up.y, value.up.z);
  camera.fov = value.fovYDeg;
  camera.near = value.near;
  camera.far = value.far;
  camera.updateProjectionMatrix();
  cloudRenderer.controls.target.set(value.target.x, value.target.y, value.target.z);
  cloudRenderer.controls.update();
}

function downloadJson(text: string, filename: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
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

function inspectMesh(options: MeshExportUiOptions): void {
  try {
    ui.setMeshStatus("検査中...");
    const result = buildCloudMesh(state.balls, state.params.k, options);
    ui.setMeshStatus(meshSummary(result), result.watertight.ok);
  } catch (err) {
    ui.setMeshStatus(`検査失敗: ${(err as Error).message}`, false);
  }
}

function exportMesh(options: MeshExportUiOptions): void {
  try {
    ui.setMeshStatus("書き出し準備中...");
    const result = buildCloudMesh(state.balls, state.params.k, options);
    ui.setMeshStatus(meshSummary(result), result.watertight.ok);
    downloadMeshBundle(result, history);
  } catch (err) {
    ui.setMeshStatus(`書き出し失敗: ${(err as Error).message}`, false);
  }
}

// Debug / verification handle (used by automated checks and the "same shape
// after import" test in the README). Read state, or feed a recipe directly.
(window as unknown as Record<string, unknown>).__cloudSculpt = {
  getBalls: () => state.balls.map((b) => ({ ...b })),
  getParams: () => ({ ...state.params }),
  getHistory: () => history.map((e) => ({ ...e })),
  exportJson: () => serializeRecipe(history),
  importJson: (text: string) => applyRecipeText(text),
  inspectMesh: (options: MeshExportUiOptions) => buildCloudMesh(state.balls, state.params.k, options),
  getWorkspaceView: () => workspaceView,
  getHikariSettings: () => ({ ...hikariSettings }),
  getOpticsComputeStatus: () => hikariLayer.getOpticsComputeStatus(),
};

// --- Render loop ------------------------------------------------------

function render(): void {
  cloudRenderer.update(state.balls, state.params.k, selectedBallId);
  cloudRenderer.setOptics(hikariSettings);
  cloudRenderer.setVisualMode(
    workspaceView === "katachi" ? "katachi" : hikariSettings.phenomenon,
  );
  const hikariShape = createCloudHikariShape(state.balls, state.params.k, {
    studyVersion: manifest.version,
    surfaceTraceStrength: hikariSettings.surfaceVariation,
  });
  hikariLayer.update(hikariShape, hikariSettings);
  ui.setHikariSource(`同じ場を観察中 — ${state.balls.length}球 / k ${state.params.k.toFixed(2)}`);
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
    ui.setOpticsComputeStatus(hikariLayer.getOpticsComputeStatus());
    fpsAccum = 0;
    frameCount = 0;
  }
  if (hikariMpmActive && (hikariMpmLastStepAt === 0 || now - hikariMpmLastStepAt >= 140)) {
    hikariMpmLastStepAt = now;
    hikariMpmDriver.advance();
    const preview = hikariMpmDriver.previewBalls();
    if (preview.length > 0) {
      state.balls = preview;
      selectedBallId = null;
      render();
      mpmStatus.textContent = hikariMpmDriver.description() + ` · ${preview.length}球プロキシ · 再生中`;
    }
  }
  hikariLayer.animate(now);
  cloudRenderer.render();
}

render();
updateSelectionLabel();
startFrameLoop(renderFrame);

function applyWorkspaceView(): void {
  const hikariVisible = workspaceView === "hikari";
  hikariLayer.setVisible(hikariVisible);
  ui.setView(workspaceView);
  render();
}

function resolveInitialWorkspaceView(): WorkspaceView {
  const entryView = document.documentElement.dataset.entryView;
  if (entryView === "hikari" || entryView === "katachi") return entryView;
  return localStorage.getItem(WORKSPACE_VIEW_KEY) === "hikari" ? "hikari" : "katachi";
}

function loadHikariSettings(): HikariSettings {
  const stored = localStorage.getItem(HIKARI_SETTINGS_KEY);
  if (!stored) return { ...DEFAULT_HIKARI_SETTINGS };
  try {
    return normalizeHikariSettings(JSON.parse(stored) as Partial<HikariSettings>);
  } catch {
    return { ...DEFAULT_HIKARI_SETTINGS };
  }
}

// ---------------------------------------------------------------------------
// Cloud Sculpt (S1) — entry point. Wires field + history + renderer + UI.
// See README.md for Question/Setup/Observation/Hypothesis/Next.
// ---------------------------------------------------------------------------

import "./style.css";
import * as THREE from "three";
import { eventTargetsViewport, ndcFromPointer } from "../../lib/input.ts";
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
import type { HistoryEntry } from "./history.ts";
import { createEmptyState, parseRecipe, record, replay, serializeRecipe } from "./history.ts";
import {
  buildCloudMesh,
  downloadMeshBundle,
  encodeBinaryStl,
  encodeObj,
  meshSummary,
} from "./meshExport.ts";
import { CloudRenderer } from "./renderer.ts";
import { createHikariCase, parseHikariCase, serializeHikariCase } from "./hikariCase.ts";
import {
  createHikariDocument,
  parseHikariDocument,
  serializeHikariDocument,
  type HikariDocumentView,
} from "./hikariDocument.ts";
import { buildCloudOpticalScene } from "./opticalSceneAdapter.ts";
import type { OpticalScene, Rgb } from "./opticalScene.ts";
import { traceStraightRay, type StraightRay, type TraceOptions } from "./opticalTrace.ts";
import {
  buildBlenderStudySidecar,
  serializeBlenderStudySidecar,
} from "./blenderStudy.ts";
import { raymarchField } from "./picking.ts";
import { MAX_BALLS } from "./shaders.ts";
import type { MeshExportUiOptions } from "./ui.ts";
import { buildUi } from "./ui.ts";
import {
  summarizeReceiverField,
  type ReceiverFieldSummary,
} from "./receiverTransport.ts";
import type { CausticFieldDiagnostics, ReceiverParityReport } from "./optics.ts";

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
const APP_COMMIT = import.meta.env.VITE_GIT_COMMIT || "unknown";
let workspaceView: WorkspaceView =
  localStorage.getItem(WORKSPACE_VIEW_KEY) === "hikari" ? "hikari" : "katachi";
let hikariSettings = loadHikariSettings();
let opticalSceneIssues: string[] = [];
let opticalInclusionValid = false;
let receiverFieldSummary: (ReceiverFieldSummary & {
  transport: CausticFieldDiagnostics;
}) | null = null;
let receiverParityReport: ReceiverParityReport | null = null;
let savedHikariViews: HikariDocumentView[] = [];
let activeHikariViewId: string | null = null;
let activeHikariDocumentId = `hikari-${new Date().toISOString().slice(0, 10)}`;
let hikariDocumentCreatedAt = new Date().toISOString();
const safeModeQuery = new URLSearchParams(window.location.search).get("safe");
const windowsCompatibilityMode =
  safeModeQuery === "1"
  || (safeModeQuery !== "0" && /Windows/i.test(navigator.userAgent));

const cloudRenderer = new CloudRenderer(viewport, {
  compatibilityMode: windowsCompatibilityMode,
});
const hikariLayer = new HikariLayer(cloudRenderer.scene, {
  disableWebGpu: windowsCompatibilityMode,
  onCausticField: (field) => {
    receiverFieldSummary = {
      ...summarizeReceiverField(field),
      transport: structuredClone(field.diagnostics),
    };
    document.documentElement.dataset.hikariReceiverField = JSON.stringify(receiverFieldSummary);
    ui.setReceiverEnergySummary(summarizeReceiverEnergy(field.diagnostics));
    cloudRenderer.setCausticField(field);
  },
  onTransportPending: (pending) => {
    cloudRenderer.setCausticTransportPending(pending);
    if (pending) {
      ui.setReceiverEnergySummary({ text: "受光面の変化を計算中", kind: "empty" });
    }
  },
});

function summarizeReceiverEnergy(
  diagnostics: CausticFieldDiagnostics,
): { text: string; kind: "ok" | "warning" | "empty" } {
  const ledger = diagnostics.energyLedger;
  const luminance = (rgb: { r: number; g: number; b: number }): number =>
    rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722;
  const incident = luminance(ledger.incidentRgb);
  if (!(incident > 1e-12)) {
    return { text: "受光面の変化なし", kind: "empty" };
  }
  const delivered = luminance(ledger.depositedRgb);
  const nonArrival = luminance(ledger.absorbedRgb)
    + luminance(ledger.reflectedRgb)
    + luminance(ledger.escapedRgb)
    + luminance(ledger.unresolvedLossRgb);
  const outside = luminance(ledger.supportRejectedRgb);
  const residual = luminance({
    r: Math.abs(ledger.residualRgb.r),
    g: Math.abs(ledger.residualRgb.g),
    b: Math.abs(ledger.residualRgb.b),
  });
  const percentage = (value: number): string => `${(value / incident * 100).toFixed(1)}%`;
  const tolerance = diagnostics.source === "webgpu" ? 0.05 : 0.01;
  const unresolvedRatio = luminance(ledger.unresolvedLossRgb) / incident;
  const kind = ledger.relativeResidual <= tolerance && unresolvedRatio <= tolerance
    ? "ok"
    : "warning";
  return {
    text: `到達 ${percentage(delivered)} · 未到達 ${percentage(nonArrival)} · 範囲外 ${percentage(outside)} · 差 ${percentage(residual)}`,
    kind,
  };
}

function summarizeReceiverParity(
  report: ReceiverParityReport,
): { text: string; kind: "passed" | "failed" | "unavailable" } {
  if (!report.metrics) {
    return {
      text: report.unavailableReason ?? "比較結果を取得できませんでした",
      kind: report.status === "failed" ? "failed" : "unavailable",
    };
  }
  const metrics = report.metrics;
  const maxFlux = Math.max(
    metrics.relativeFluxErrorRgb.r,
    metrics.relativeFluxErrorRgb.g,
    metrics.relativeFluxErrorRgb.b,
  );
  const centroid = metrics.centroidDistanceTexels?.toFixed(2) ?? "—";
  const envelope = metrics.envelopeDistanceTexels?.toFixed(2) ?? "—";
  const label = report.pass ? "一致" : "差を検出";
  const gateLabels: Record<keyof typeof metrics.gates, string> = {
    structure: "構造",
    flux: "光量",
    centroid: "重心",
    envelope: "外形",
    support: "支持域",
    depositShape: "到達分布",
    coverageShape: "影分布",
  };
  const failedGates = Object.entries(metrics.gates)
    .filter(([, passed]) => !passed)
    .map(([gate]) => gateLabels[gate as keyof typeof metrics.gates]);
  const failure = failedGates.length > 0 ? ` · 要確認 ${failedGates.join("/")}` : "";
  return {
    text: `${label} · 光量差 ${(maxFlux * 100).toFixed(2)}% · 重心 ${centroid}px · 外形 ${envelope}px · 支持域 ${(metrics.supportIou * 100).toFixed(1)}% · 到達L1 ${(metrics.normalizedDepositL1 * 100).toFixed(1)}% · 影L1 ${(metrics.normalizedCoverageL1 * 100).toFixed(1)}%${failure}`,
    kind: report.pass ? "passed" : "failed",
  };
}

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
  onBlenderExport: (details) => void exportBlenderStudy(details),
  onImageExport: () => exportViewportPng(),
  onReceiverParityRun: async () => {
    receiverParityReport = await hikariLayer.runReceiverParityCase(
      state.balls.map((ball) => ({ ...ball })),
      state.params.k,
      { ...hikariSettings },
      { caseId: "author-current-scene", sampleCount: 2048 },
    );
    document.documentElement.dataset.hikariReceiverParity = JSON.stringify(receiverParityReport);
    return summarizeReceiverParity(receiverParityReport);
  },
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
  onHikariCaseSave: (details) => addCurrentHikariView(details.caseId, details.observation),
  onHikariCaseImportFile: (file) => importHikariCase(file),
  onHikariDocumentSave: (details) => exportHikariDocument(
    details.documentId,
    details.observation,
  ),
  onHikariViewActivate: (viewId) => activateHikariView(viewId),
  },
);
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

function applyHikariCaseValue(
  value: ReturnType<typeof parseHikariCase>,
  documentId = value.caseId,
): void {
  history = structuredClone(value.shape.recipeEntries);
  state = replay(history);
  selectedBallId = null;
  hikariSettings = normalizeHikariSettings(value.hikariSettings);
  localStorage.setItem(HIKARI_SETTINGS_KEY, JSON.stringify(hikariSettings));
  ui.syncParams(state.params);
  ui.syncHikariSettings(hikariSettings);
  ui.syncHikariCaseDetails({ caseId: documentId, observation: value.observation });
  ui.setHistoryCount(history.length);
  cloudRenderer.restoreCamera(value.camera);
  workspaceView = "hikari";
  localStorage.setItem(WORKSPACE_VIEW_KEY, workspaceView);
  updateSelectionLabel();
  applyWorkspaceView();
}

function addCurrentHikariView(documentId: string, observation: string): void {
  activeHikariDocumentId = documentId;
  let sequence = savedHikariViews.length + 1;
  let viewId = `${safeCaseId(documentId)}-view-${String(sequence).padStart(2, "0")}`;
  while (savedHikariViews.some((view) => view.viewId === viewId)) {
    sequence++;
    viewId = `${safeCaseId(documentId)}-view-${String(sequence).padStart(2, "0")}`;
  }
  const minutes = hikariSettings.daylightMinutes;
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const now = new Date().toISOString();
  savedHikariViews.push({
    viewId,
    name: `ビュー ${String(sequence).padStart(2, "0")} · ${time}`,
    createdAt: now,
    case: currentHikariCase(viewId, observation),
  });
  activeHikariViewId = viewId;
  syncHikariViewList();
  ui.setHikariCaseStatus(`現在の見え方を追加しました: ${viewId}`, true);
}

function activateHikariView(viewId: string): void {
  const view = savedHikariViews.find((candidate) => candidate.viewId === viewId);
  if (!view) return;
  activeHikariViewId = viewId;
  applyHikariCaseValue(view.case, activeHikariDocumentId);
  syncHikariViewList();
  ui.setHikariCaseStatus(`ビューを呼び戻しました: ${view.name}`, true);
}

function syncHikariViewList(): void {
  ui.setHikariViews(
    savedHikariViews.map(({ viewId, name }) => ({ viewId, name })),
    activeHikariViewId,
  );
}

function exportHikariDocument(documentId: string, observation: string): void {
  activeHikariDocumentId = documentId;
  if (savedHikariViews.length === 0) addCurrentHikariView(documentId, observation);
  const document = createHikariDocument({
    documentId,
    appVersion: manifest.version,
    commit: APP_COMMIT,
    activeViewId: activeHikariViewId,
    views: savedHikariViews,
    createdAt: hikariDocumentCreatedAt,
  });
  const filename = `${safeCaseId(documentId)}.hkr`;
  downloadFile(
    new Blob([serializeHikariDocument(document)], { type: "application/json" }),
    filename,
  );
  ui.setHikariCaseStatus(`${filename} · ${document.views.length}ビューを保存しました`, true);
}

function applyHikariCaseText(text: string): void {
  const raw = JSON.parse(text) as { format?: unknown };
  if (raw?.format === "hikari-document") {
    const document = parseHikariDocument(text);
    savedHikariViews = document.views.map((view) => structuredClone(view));
    activeHikariViewId = document.activeViewId ?? document.views[0]?.viewId ?? null;
    activeHikariDocumentId = document.documentId;
    hikariDocumentCreatedAt = document.createdAt;
    const active = savedHikariViews.find((view) => view.viewId === activeHikariViewId)
      ?? savedHikariViews[0];
    if (active) applyHikariCaseValue(active.case, document.documentId);
    else ui.syncHikariCaseDetails({ caseId: document.documentId, observation: "" });
    syncHikariViewList();
    ui.setHikariCaseStatus(`${document.documentId}.hkr · ${document.views.length}ビューを開きました`, true);
    return;
  }
  const value = parseHikariCase(text);
  savedHikariViews = [{
    viewId: `${safeCaseId(value.caseId)}-view-01`,
    name: "読み込んだ旧case",
    createdAt: value.createdAt,
    case: value,
  }];
  activeHikariViewId = savedHikariViews[0].viewId;
  activeHikariDocumentId = value.caseId;
  hikariDocumentCreatedAt = value.createdAt;
  applyHikariCaseValue(value, value.caseId);
  syncHikariViewList();
  ui.setHikariCaseStatus(`旧caseを1ビューのHikari文書として開きました: ${value.caseId}`, true);
}

async function importHikariCase(file: File): Promise<void> {
  try {
    applyHikariCaseText(await file.text());
  } catch (err) {
    ui.setHikariCaseStatus(`caseの読み込みに失敗しました: ${(err as Error).message}`, false);
  }
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

async function exportBlenderStudy(details: {
  caseId: string;
  observation: string;
  options: MeshExportUiOptions;
}): Promise<void> {
  try {
    ui.setBlenderExportStatus("Blender用データを準備中...");
    const mesh = buildCloudMesh(state.balls, state.params.k, details.options);
    if (!mesh.watertight.ok) {
      throw new Error("透明体のメッシュが水密ではありません。解像度か形状を調整してください");
    }
    const adapter = buildCloudOpticalScene(state.balls, state.params.k, hikariSettings);
    if (adapter.issues.length > 0) throw new Error(opticalSceneIssueText(adapter.issues));
    const scene = opticalSceneAtExportScale(adapter, mesh.scaleMmPerUnit);
    const caseValue = currentHikariCase(details.caseId, details.observation);
    const baseName = safeCaseId(details.caseId);
    const obj = encodeObj(mesh);
    const stl = encodeBinaryStl(mesh, baseName);
    const objSha256 = await sha256Hex(new TextEncoder().encode(obj));
    const stlSha256 = await sha256Hex(new Uint8Array(stl));
    const sidecar = buildBlenderStudySidecar({
      hikariCase: caseValue,
      opticalScene: scene,
      mesh: {
        assets: [
          {
            filename: `${baseName}.obj`, format: "obj", role: "host",
            mediumId: scene.host.id, purpose: "primary", space: "medium-local", sha256: objSha256,
          },
          {
            filename: `${baseName}.stl`, format: "stl", role: "host",
            mediumId: scene.host.id, purpose: "check", space: "medium-local", sha256: stlSha256,
          },
        ],
        resolution: Math.round(details.options.resolution),
        triangleCount: mesh.triangles.length,
        watertight: mesh.watertight.ok,
        scaleMmPerUnit: mesh.scaleMmPerUnit,
      },
      environment: {
        world: hikariSettings.daylightMode === "tokyo" ? "Tokyo clear-sky realtime approximation" : "Manual realtime sun approximation",
        exposure: hikariSettings.opticalExposure,
        viewTransform: "Record Blender view transform after import",
        renderer: "cycles",
        notes: [
          "The imported OBJ is the primary host geometry; the STL download is a secondary topology check.",
          "Room and window geometry are not part of the runtime scene yet.",
        ],
      },
      approximations: [
        "The selected longest edge defines an author scale for this export.",
        "Absorption was converted from Hikari's visual per-shape-unit control at that scale; it is appearance-matched, not a measured resin coefficient.",
      ],
      sunAngularDiameterDeg: hikariSettings.sunSize,
    });
    downloadFile(new Blob([obj], { type: "text/plain" }), `${baseName}.obj`);
    downloadFile(new Blob([stl], { type: "model/stl" }), `${baseName}.stl`);
    downloadFile(new Blob([serializeRecipe(history)], { type: "application/json" }), `${baseName}.recipe.json`);
    downloadFile(new Blob([serializeHikariCase(caseValue)], { type: "application/json" }), `${baseName}.hikari-case.json`);
    downloadFile(new Blob([serializeBlenderStudySidecar(sidecar)], { type: "application/json" }), `${baseName}.blender-study.json`);
    ui.setBlenderExportStatus(`${baseName} — OBJ / STL / case / Blender設定を書き出しました`, true);
  } catch (error) {
    ui.setBlenderExportStatus(`Blender用書き出し失敗: ${(error as Error).message}`, false);
  }
}

function currentHikariCase(caseId: string, observation: string) {
  const backend = hikariLayer.getOpticsComputeStatus();
  return createHikariCase({
    caseId,
    observation,
    appVersion: manifest.version,
    commit: APP_COMMIT,
    shape: { studyId: "cloud-sculpt", recipeEntries: structuredClone(history) },
    hikariSettings: { ...hikariSettings },
    camera: cloudRenderer.captureCamera(),
    compatibility: {
      safeModeQuery:
        safeModeQuery === "1" ? "forced" : safeModeQuery === "0" ? "disabled" : "auto",
      compatibilityMode: windowsCompatibilityMode,
    },
    backend: {
      kind: backend.kind,
      text: backend.text,
      requestedSampleCount: hikariSettings.opticalSampleCount,
    },
  });
}

function opticalSceneAtExportScale(
  adapter: ReturnType<typeof buildCloudOpticalScene>,
  mmPerShapeUnit: number,
): OpticalScene {
  const materialAtScale = (material: OpticalScene["host"]["material"], absorption: Rgb) => ({
    ...material,
    absorptionPerMm: {
      r: absorption.r / mmPerShapeUnit,
      g: absorption.g / mmPerShapeUnit,
      b: absorption.b / mmPerShapeUnit,
    },
  });
  return {
    ...adapter.scene,
    host: {
      ...adapter.scene.host,
      material: materialAtScale(adapter.scene.host.material, adapter.hostAbsorptionPerShapeUnit),
    },
    inclusions: adapter.scene.inclusions.map((inclusion) => ({
      ...inclusion,
      material: materialAtScale(inclusion.material, adapter.inclusionAbsorptionPerShapeUnit),
    })),
    physicalScale: { mmPerShapeUnit, source: "author" },
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function exportViewportPng(): Promise<{
  filename: string;
  width: number;
  height: number;
}> {
  const captured = await cloudRenderer.capturePng();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `hikari-${hikariSettings.phenomenon}-${timestamp}.png`;
  downloadFile(captured.blob, filename);
  return { filename, width: captured.width, height: captured.height };
}

function safeCaseId(caseId: string): string {
  return caseId.replace(/[^a-zA-Z0-9_-]+/g, "-") || "hikari-blender-study";
}

function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  getCameraSnapshot: () => cloudRenderer.captureCamera(),
  getOpticsComputeStatus: () => hikariLayer.getOpticsComputeStatus(),
  getReceiverFieldSummary: () => receiverFieldSummary == null
    ? null
    : structuredClone(receiverFieldSummary),
  getReceiverParityReport: () => receiverParityReport == null
    ? null
    : structuredClone(receiverParityReport),
  runReceiverParityCase: (options?: { caseId?: string; sampleCount?: number }) =>
    hikariLayer.runReceiverParityCase(
      state.balls.map((ball) => ({ ...ball })),
      state.params.k,
      { ...hikariSettings },
      options,
    ),
  getOpticalSceneValidation: () => {
    const adapter = buildCloudOpticalScene(state.balls, state.params.k, hikariSettings);
    return {
      issues: [...adapter.issues],
      inclusionValid: adapter.inclusionValid,
      containmentWitness: adapter.containmentWitness,
    };
  },
  traceOpticalRay: (ray: StraightRay, options?: TraceOptions) => {
    const adapter = buildCloudOpticalScene(state.balls, state.params.k, hikariSettings);
    return traceStraightRay(adapter.scene, ray, options);
  },
  exportHikariCaseJson: (caseId = "debug-case", observation = "") => {
    return serializeHikariCase(currentHikariCase(caseId, observation));
  },
  importHikariCaseJson: (text: string) => applyHikariCaseText(text),
};

// --- Render loop ------------------------------------------------------

function render(): void {
  const opticalScene = buildCloudOpticalScene(state.balls, state.params.k, hikariSettings);
  opticalSceneIssues = opticalScene.issues;
  opticalInclusionValid = opticalScene.inclusionValid;
  cloudRenderer.update(state.balls, state.params.k, selectedBallId);
  cloudRenderer.setOptics(hikariSettings);
  cloudRenderer.setOpticalScene(opticalScene);
  cloudRenderer.setVisualMode(
    workspaceView === "katachi" ? "katachi" : hikariSettings.phenomenon,
  );
  hikariLayer.update(state.balls, state.params.k, hikariSettings);
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
    const computeStatus = hikariLayer.getOpticsComputeStatus();
    const sunBelowHorizon = computeStatus.text.includes("太陽は地平線下");
    const inclusionCausticReady = !sunBelowHorizon
      && (computeStatus.kind === "cpu" || computeStatus.kind === "webgpu");
    cloudRenderer.setInclusionCausticTrustworthy(inclusionCausticReady);
    if (hikariSettings.inclusionEnabled && !opticalInclusionValid) {
      ui.setOpticsComputeStatus({
        kind: "error",
        text: opticalSceneIssueText(opticalSceneIssues),
      });
    } else if (hikariSettings.inclusionEnabled && !sunBelowHorizon) {
      ui.setOpticsComputeStatus({
        ...computeStatus,
        text: `${computeStatus.text} · 内包1 · ${inclusionCausticReady ? "内包の集光" : "内包の集光を更新中"}`,
      });
    } else {
      ui.setOpticsComputeStatus(computeStatus);
    }
    fpsAccum = 0;
    frameCount = 0;
  }
  hikariLayer.animate(now);
  cloudRenderer.render();
}

function opticalSceneIssueText(issues: readonly string[]): string {
  if (issues.some((issue) => issue.includes("not contained"))) {
    return "内包を表示できません — 外側の透明体に収まっていません";
  }
  if (issues.some((issue) => issue.includes("Host shape"))) {
    return "内包を表示できません — 先に外側のかたちを作ってください";
  }
  return "内包を表示できません — 位置と大きさを確認してください";
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

function loadHikariSettings(): HikariSettings {
  const stored = localStorage.getItem(HIKARI_SETTINGS_KEY);
  if (!stored) return { ...DEFAULT_HIKARI_SETTINGS };
  try {
    return normalizeHikariSettings(JSON.parse(stored) as Partial<HikariSettings>);
  } catch {
    return { ...DEFAULT_HIKARI_SETTINGS };
  }
}

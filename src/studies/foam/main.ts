// ---------------------------------------------------------------------------
// Foam Cells (S-foam / T7) — entry point. Wires field (shared with S1) +
// cell.ts's foam SDF + history + renderer + UI. See README.md for
// Question/Setup/Observation/Hypothesis/Next.
// ---------------------------------------------------------------------------

import "./style.css";
import manifest from "./manifest.json";
import { DEFAULT_FIELD_PARAMS } from "../cloud-sculpt/field.ts";
import { DEFAULT_FOAM_PARAMS } from "./cell.ts";
import type { FoamHistoryEntry } from "./history.ts";
import {
  createEmptyFoamState,
  loadFromS1Recipe,
  parseFoamRecipe,
  record,
  replayFoam,
  serializeFoamRecipe,
} from "./history.ts";
import { buildFoamMesh, downloadFoamMeshBundle, meshSummary } from "./meshExport.ts";
import { FoamRenderer } from "./renderer.ts";
import type { FoamMeshUiOptions } from "./ui.ts";
import { buildFoamUi } from "./ui.ts";

const app = document.getElementById("app")!;
const viewport = document.createElement("div");
viewport.id = "viewport";
app.appendChild(viewport);

// --- State -------------------------------------------------------------
let history: FoamHistoryEntry[] = [];
let state = createEmptyFoamState();

const foamRenderer = new FoamRenderer(viewport);

// Seed with the same default grow S1 opens with, so foam opens with
// something to look at (matches cloud-sculpt/main.ts's seeding).
record(history, state, "grow", { params: { ...DEFAULT_FIELD_PARAMS } });
record(history, state, "setFoamParam", { key: "opening", value: DEFAULT_FOAM_PARAMS.opening });
record(history, state, "setFoamParam", { key: "thickness", value: DEFAULT_FOAM_PARAMS.thickness });

function regrowCurrentField(): void {
  record(history, state, "grow", { params: { ...state.fieldParams } });
  ui.setHistoryCount(history.length);
  ui.setBallCount(state.balls.length);
  render();
}

// --- UI ------------------------------------------------------------------
const ui = buildFoamUi(app, state.fieldParams, state.foamParams, manifest.version, manifest.updatedAt, {
  onFieldParamChange: (key, value) => {
    record(history, state, "setFieldParam", { key, value });
    if (key !== "k") {
      regrowCurrentField();
      return;
    }
    ui.setHistoryCount(history.length);
    render();
  },
  onFoamParamChange: (key, value) => {
    record(history, state, "setFoamParam", { key, value });
    ui.setHistoryCount(history.length);
    render();
  },
  onGrow: () => regrowCurrentField(),
  onReroll: () => {
    const seed = Math.random().toString(36).slice(2, 8);
    record(history, state, "grow", { params: { ...state.fieldParams, seed } });
    ui.syncFieldParams(state.fieldParams);
    ui.setHistoryCount(history.length);
    ui.setBallCount(state.balls.length);
    render();
  },
  onClear: () => {
    record(history, state, "clear", {});
    ui.setHistoryCount(history.length);
    ui.setBallCount(state.balls.length);
    render();
  },
  onExport: () => exportHistory(),
  onImportFile: (file) => importHistory(file),
  onImportS1File: (file) => importS1Recipe(file),
  onMeshInspect: (options) => inspectMesh(options),
  onMeshExport: (options) => exportMesh(options),
});
foamRenderer.resize();
ui.setHistoryCount(history.length);
ui.setBallCount(state.balls.length);

// --- History export / import ----------------------------------------------

function exportHistory(): void {
  const json = serializeFoamRecipe(history);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `foam-recipe-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function applyRecipeText(text: string): void {
  const entries = parseFoamRecipe(text);
  history = entries;
  state = replayFoam(entries);
  ui.syncFieldParams(state.fieldParams);
  ui.syncFoamParams(state.foamParams);
  ui.setHistoryCount(history.length);
  ui.setBallCount(state.balls.length);
  render();
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
    const { balls, params } = loadFromS1Recipe(await file.text());
    record(history, state, "loadBalls", { balls, params, source: "S1" });
    ui.syncFieldParams(state.fieldParams);
    ui.setHistoryCount(history.length);
    ui.setBallCount(state.balls.length);
    render();
  } catch (err) {
    alert(`S1 レシピの読み込みに失敗しました: ${(err as Error).message}`);
  }
}

function inspectMesh(options: FoamMeshUiOptions): void {
  try {
    ui.setMeshStatus("検査中...");
    const result = buildFoamMesh(state.balls, state.fieldParams.k, state.foamParams, options);
    ui.setMeshStatus(meshSummary(result), result.watertight.ok);
  } catch (err) {
    ui.setMeshStatus(`検査失敗: ${(err as Error).message}`, false);
  }
}

function exportMesh(options: FoamMeshUiOptions): void {
  try {
    ui.setMeshStatus("書き出し準備中...");
    const result = buildFoamMesh(state.balls, state.fieldParams.k, state.foamParams, options);
    ui.setMeshStatus(meshSummary(result), result.watertight.ok);
    downloadFoamMeshBundle(result, history);
  } catch (err) {
    ui.setMeshStatus(`書き出し失敗: ${(err as Error).message}`, false);
  }
}

// Debug / verification handle (used by automated checks — the "same shape
// after import" test in the README). Read state, or feed a recipe directly.
(window as unknown as Record<string, unknown>).__foam = {
  getBalls: () => state.balls.map((b) => ({ ...b })),
  getFieldParams: () => ({ ...state.fieldParams }),
  getFoamParams: () => ({ ...state.foamParams }),
  getHistory: () => history.map((e) => ({ ...e })),
  exportJson: () => serializeFoamRecipe(history),
  importJson: (text: string) => applyRecipeText(text),
  importS1Json: async (text: string) => {
    const { balls, params } = loadFromS1Recipe(text);
    record(history, state, "loadBalls", { balls, params, source: "S1" });
    render();
  },
  inspectMesh: (options: FoamMeshUiOptions) =>
    buildFoamMesh(state.balls, state.fieldParams.k, state.foamParams, options),
};

// --- Render loop ------------------------------------------------------

function render(): void {
  foamRenderer.update(state.balls, state.fieldParams.k, state.foamParams);
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
  foamRenderer.render();
}

render();
tick();

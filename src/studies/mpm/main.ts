// ---------------------------------------------------------------------------
// S2c (MPM) — entry point. Wiring shape follows S1/S2/S2b: state + history +
// renderer + ui, a debug handle on window, an rAF render loop. New here:
// simulation is NOT run every frame implicitly (T2d-mpm.md's "60fps の保証"
// is explicitly out of scope) — a "run" button advances physics by a fixed
// substep count and records ONE history entry; "自動実行" repeats that every
// frame but flushes a SINGLE consolidated `run` entry when toggled off (see
// history.ts's doc comment for why this is still exactly replay-faithful).
// ---------------------------------------------------------------------------

import "./style.css";
import { startFrameLoop } from "../../lib/loop.ts";
import * as THREE from "three";
import manifest from "./manifest.json";
import { DEFAULT_FIELD_PARAMS, growBalls } from "../cloud-sculpt/field.ts";
import type { Ball } from "../cloud-sculpt/field.ts";
import { parseRecipe as parseS1Recipe, replay as replayS1 } from "../cloud-sculpt/history.ts";
import type { Mat3 } from "./mat3.ts";
import { DEFAULT_MPM_PARAMS, type MpmParams } from "./params.ts";
import type { MpmParticle } from "./particle.ts";
import type { MpmHistoryEntry, MpmState } from "./history.ts";
import { createEmptyState, parseRecipe, record, replay, serializeFrozenAsS1Recipe, serializeRecipe } from "./history.ts";
import { freezeParticlesToBalls, seedParticlesFromBalls } from "./seeding.ts";
import { DOMAIN_SIZE, DT, makeGrid, marginWorld, runSteps } from "./sim.ts";
import { MpmRenderer } from "./renderer.ts";
import { buildUi } from "./ui.ts";
import { fillMeshWithParticles, MAX_MESH_PARTICLES, parseBinaryStl } from "./stlImport.ts";
import type { MeshFillResult } from "./stlImport.ts";
import type { BackendKind } from "./gpu/capabilities.ts";
import { requestWebGpuDevice, webGpuUnavailableReason } from "./gpu/capabilities.ts";
import { GpuMpmSim } from "./gpu/gpuSim.ts";

const app = document.getElementById("app")!;
const viewport = document.createElement("div");
viewport.id = "viewport";
app.appendChild(viewport);

let history: MpmHistoryEntry[] = [];
let state: MpmState = createEmptyState();
let totalSteps = 0;
let autoRun = false;
let autoRunAccumSteps = 0;

// --- WebGPU backend (T2e) ---------------------------------------------------
// backendKind is a purely LIVE/runtime concern -- never written into history
// (T2e §3 "バックエンドは履歴に乗せない"). gpuDirty tracks whether the CPU-side
// mirror (state.particles) is missing velocity/F/C updates that already
// happened on the GPU (true only during autorun in webgpu mode, which reads
// back positions only every frame for cost reasons -- see tick() below and
// README's transfer-cost table). ensureFullGpuSync() closes that gap on
// demand before anything that needs the full state (freeze, backend switch,
// history flush-to-stop).
let backendKind: BackendKind = "cpu";
let gpu: GpuMpmSim | null = null;
let webgpuDevice: GPUDevice | null = null;
let gpuAvailable = false;
let gpuAdapterInfo: string | undefined;
let gpuDirty = false;
let gpuBusy = false;

const webglRenderer = new THREE.WebGLRenderer({ antialias: true });
webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const mpmRenderer = new MpmRenderer(viewport, webglRenderer);

const ui = buildUi(app, state.params, manifest.version, manifest.updatedAt, {
  onParamChange: (key, value) => {
    flushAutoRun();
    record(history, state, "setParam", { key, value });
    if (key === "gridN") {
      mpmRenderer.setGridResolution(state.params.gridN);
      if (gpu) gpu.setGridResolution(state.params.gridN);
    }
    ui.setHistoryCount(history.length);
    refreshStatus();
  },
  onSeedDefault: () => {
    flushAutoRun();
    const balls = growBalls({ ...DEFAULT_FIELD_PARAMS });
    seedFrom(balls, state.params);
  },
  onReseed: () => {
    flushAutoRun();
    const seed = Math.random().toString(36).slice(2, 8);
    const balls = growBalls({ ...DEFAULT_FIELD_PARAMS, seed });
    seedFrom(balls, state.params);
  },
  onImportS1File: async (file) => {
    flushAutoRun();
    try {
      const text = await file.text();
      const entries = parseS1Recipe(text);
      const s1State = replayS1(entries);
      if (s1State.balls.length === 0) {
        alert("取り込んだレシピに球がありません。");
        return;
      }
      seedFrom(s1State.balls, state.params);
    } catch (err) {
      alert(`S1レシピの読み込みに失敗しました: ${(err as Error).message}`);
    }
  },
  onImportStlFile: async (file) => {
    flushAutoRun();
    try {
      const buffer = await file.arrayBuffer();
      const result = importStlBuffer(buffer, file.name);
      if (result.truncated) {
        alert(
          `粒子数が上限(${MAX_MESH_PARTICLES.toLocaleString()})を超えたため間引きました` +
            `（充填候補 ${result.requestedCount.toLocaleString()} → ${result.particleCount.toLocaleString()}）。` +
            "総質量はこの形の推定体積から保存しています。",
        );
      }
    } catch (err) {
      alert(`STLの読み込みに失敗しました: ${(err as Error).message}`);
    }
  },
  onRunOnce: async () => {
    flushAutoRun();
    await runPhysicsOnce(state.params.substepsPerRun);
    history.push({ t: Date.now(), op: "run", args: { steps: state.params.substepsPerRun } });
    totalSteps += state.params.substepsPerRun;
    ui.setHistoryCount(history.length);
    refreshStatus();
  },
  onAutoRunToggle: async (enabled) => {
    autoRun = enabled;
    if (!enabled) {
      flushAutoRun();
      await ensureFullGpuSync();
      refreshStatus();
    }
  },
  onFreeze: async () => {
    // async 経路（GPU 読み戻し）が失敗すると「押したのに何も起きない」無言の故障になる。
    // 起きたことは必ず画面で言う（不変則: 黙って壊れない）。
    try {
      // 「凍らせる」= 押した瞬間の形を固める。動きも止める（凍るという言葉のとおりに振る舞う。
      // 止めないと、読み戻しの await 中もシミュレーションが進み、掴んだ瞬間と画面がずれる）
      autoRun = false;
      ui.setAutoRun(false);
      flushAutoRun();
      if (state.particles.length === 0) {
        alert("凍らせる材料がありません（先に種をまいてください）。");
        return;
      }
      await ensureFullGpuSync();
      const grid = makeGrid(state.params.gridN);
      const balls = freezeParticlesToBalls(state.particles, state.params.densityKgM3, grid.dx * 3);
      record(history, state, "freeze", { balls });
      ui.setHistoryCount(history.length);
      ui.setFrozenCount(state.frozen.length);
      refreshStatus();
    } catch (err) {
      alert(`凍結に失敗しました: ${(err as Error).message}\n（GPU からの読み戻しで失敗した場合は、一度 CPU に切り替えてから凍らせると通ることがあります）`);
    }
  },
  onExportHistory: () => exportHistory(),
  onImportHistoryFile: (file) => importHistory(file),
  onExportFrozenS1: () => exportFrozenS1(),
  onClear: () => {
    flushAutoRun();
    record(history, state, "clear", {});
    totalSteps = 0;
    gpuDirty = false;
    if (gpu) gpu.upload(state.particles, state.params.gridN);
    ui.setHistoryCount(history.length);
    ui.setFrozenCount(state.frozen.length);
    refreshStatus();
  },
  onBackendChange: async (kind) => {
    if (kind === backendKind) return;
    if (kind === "webgpu" && !gpuAvailable) return;
    flushAutoRun();
    if (backendKind === "webgpu" && kind === "cpu") {
      // Pull whatever the GPU has already advanced to (positions are always
      // fresh via tick()'s per-frame readback; this closes the vel/F/C gap)
      // so CPU continues the simulation from the same physical state instead
      // of a visible "reset".
      await ensureFullGpuSync();
    }
    backendKind = kind;
    if (kind === "webgpu" && gpu && state.particles.length > 0) {
      gpu.upload(state.particles, state.params.gridN);
      gpuDirty = false;
    }
    ui.setBackendInfo({ active: backendKind, webgpuAvailable: gpuAvailable, detecting: false, adapterInfo: gpuAdapterInfo });
  },
});
// The renderer was constructed before the panel existed, so its first
// resize() measured a full-window viewport and baked that width into the
// canvas's inline style — which then overlaps (and steals every pointer
// event from) the panel. Re-measure now that the panel is mounted.
// S1/S2/S2b do the same post-buildUi resize.
mpmRenderer.resize();
// 凍結0件の初期状態でも書き出しボタンの有効/無効を正しく同期する
ui.setFrozenCount(state.frozen.length);

// --- WebGPU capability detection (T2e "起動時に能力検出... 画面にどちらか明示") --
// Starts immediately; the UI shows "検出中…" until this resolves (see ui.ts's
// setBackendInfo). If a device is obtained, WebGPU becomes the DEFAULT
// backend (auto-select per T2e), matching whatever particles are already
// seeded. CPU always remains fully usable (manual switch, and the automatic
// fallback if detection fails) -- see README "Setup" for why CPU is kept
// as both fallback and the deterministic verification baseline.
ui.setBackendInfo({ active: backendKind, webgpuAvailable: false, detecting: true });
requestWebGpuDevice().then((handle) => {
  if (handle) {
    webgpuDevice = handle.device;
    gpu = new GpuMpmSim(handle.device);
    gpuAvailable = true;
    gpuAdapterInfo = handle.adapterInfo;
    backendKind = "webgpu";
    if (state.particles.length > 0) {
      gpu.upload(state.particles, state.params.gridN);
      gpuDirty = false;
    }
  } else {
    gpuAvailable = false;
  }
  ui.setBackendInfo({
    active: backendKind,
    webgpuAvailable: gpuAvailable,
    detecting: false,
    adapterInfo: gpuAdapterInfo,
    unavailableReason: gpuAvailable ? undefined : webGpuUnavailableReason() ?? "WebGPU デバイスの取得に失敗（アダプタ/ドライバ）",
  });
});

/** Run `steps` substeps on whichever backend is currently active, leaving `state.particles` fully up to date afterward (full readback for GPU -- this is an explicit, discrete action, not a per-frame cost; contrast with tick()'s lighter per-frame path). */
async function runPhysicsOnce(steps: number): Promise<void> {
  if (backendKind === "webgpu" && gpu) {
    if (gpu.getParticleCount() !== state.particles.length) gpu.upload(state.particles, state.params.gridN);
    gpu.runSteps(state.params, DT, steps);
    const full = await gpu.readBackFull();
    applyFullReadbackToParticles(state.particles, full);
    gpuDirty = false;
  } else {
    const grid = makeGrid(state.params.gridN);
    runSteps(state.particles, grid, state.params, steps);
  }
}

/** Close the vel/F/C staleness gap left by tick()'s position-only autorun readback (see that function). No-op unless actually dirty. */
async function ensureFullGpuSync(): Promise<void> {
  if (backendKind === "webgpu" && gpu && gpuDirty) {
    const full = await gpu.readBackFull();
    applyFullReadbackToParticles(state.particles, full);
    gpuDirty = false;
  }
}

function applyFullReadbackToParticles(particles: MpmParticle[], data: { pos: Float32Array; vel: Float32Array; F: Float32Array; C: Float32Array }): void {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x = data.pos[i * 3];
    p.y = data.pos[i * 3 + 1];
    p.z = data.pos[i * 3 + 2];
    p.vx = data.vel[i * 3];
    p.vy = data.vel[i * 3 + 1];
    p.vz = data.vel[i * 3 + 2];
    for (let k = 0; k < 9; k++) {
      p.F[k] = data.F[i * 9 + k];
      p.C[k] = data.C[i * 9 + k];
    }
  }
}

function applyPositionsToParticles(particles: MpmParticle[], pos: Float32Array): void {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x = pos[i * 3];
    p.y = pos[i * 3 + 1];
    p.z = pos[i * 3 + 2];
  }
}

/** After any op that replaces `state.particles` wholesale (seed / history import / clear), keep the GPU's copy in sync so the next run doesn't operate on stale data. */
function syncGpuAfterStateReset(): void {
  if (backendKind === "webgpu" && gpu) {
    gpu.upload(state.particles, state.params.gridN);
    gpuDirty = false;
  }
}

/**
 * S1's growBalls() (and hand-sculpted clouds generally) are not guaranteed
 * to sit above y=0 — S1/S2/S2b's SDF/spring worlds don't need a hard floor
 * at seed time (sag.ts's ground constraint only clamps AFTER relaxing).
 * The MPM grid, though, is a finite box starting at y=0 (sim.ts's
 * DOMAIN_SIZE) — a ball seeded partly below it would scatter particles
 * outside the grid the quadratic kernel needs. So seeding lifts the whole
 * incoming cloud (rigidly, keeping its shape) until its lowest point clears
 * the ground with a small margin, before it ever becomes material points.
 * This shift is applied to the balls actually recorded in the `seed` op's
 * args, so it's fully part of the reproducible history, not a hidden
 * runtime adjustment.
 */
function liftAboveGround(balls: Ball[], gridN: number): Ball[] {
  if (balls.length === 0) return balls;
  const floorY = marginWorld(gridN);
  const minBottom = Math.min(...balls.map((b) => b.y - b.r));
  const clearance = floorY + 0.05;
  const shift = minBottom < clearance ? clearance - minBottom : 0;
  if (shift === 0) return balls;
  return balls.map((b) => ({ ...b, y: b.y + shift }));
}

function seedFrom(rawBalls: Ball[], params: MpmParams): void {
  const balls = liftAboveGround(rawBalls, params.gridN);
  record(history, state, "seed", { balls, params: { ...params } });
  totalSteps = 0;
  mpmRenderer.setGridResolution(params.gridN);
  syncGpuAfterStateReset();
  ui.setHistoryCount(history.length);
  ui.setFrozenCount(state.frozen.length);
  refreshStatus();
}

/**
 * T2f: seed particles from an already-filled STL result (`fillMeshWithParticles`'s
 * MeshFillResult). Records a `seedMesh` history entry carrying the fill's
 * particle positions explicitly (history.ts's confirmed design -- same
 * "carry the result, not the recipe for it" pattern as `freeze`), so replay
 * reproduces the exact same particle configuration without ever needing the
 * original STL triangle data again.
 */
function seedFromMesh(fill: MeshFillResult, fileName: string, triangleCount: number, params: MpmParams): void {
  record(history, state, "seedMesh", {
    positions: fill.positions,
    totalVolume0: fill.totalVolume0,
    params: { ...params },
    source: { fileName, triangleCount, voxelSize: fill.voxelSize, scale: fill.scale, truncated: fill.truncated, requestedCount: fill.requestedCount },
  });
  totalSteps = 0;
  mpmRenderer.setGridResolution(params.gridN);
  syncGpuAfterStateReset();
  ui.setHistoryCount(history.length);
  ui.setFrozenCount(state.frozen.length);
  refreshStatus();
}

/**
 * Parse + voxel-fill a binary STL ArrayBuffer and seed particles from it.
 * Shared by the UI file-input handler and the `__mpm.importStlArrayBuffer`
 * debug/verification hook (AGENTS' window.__study convention) so both paths
 * exercise identical logic.
 */
function importStlBuffer(
  buffer: ArrayBuffer,
  fileName: string,
): { particleCount: number; requestedCount: number; truncated: boolean; scale: number; voxelSize: number; triangleCount: number } {
  const triangles = parseBinaryStl(buffer);
  // Same clearance convention as liftAboveGround (main.ts, S1 balls): rest
  // just above the simulated floor (sim.ts's marginWorld), not at y=0.
  const floorY = marginWorld(state.params.gridN) + 0.05;
  const fill = fillMeshWithParticles(triangles, {
    particlesPerUnitVolume: state.params.particlesPerUnitVolume,
    domainSize: DOMAIN_SIZE,
    targetLongestFraction: 0.6,
    floorY,
    maxParticles: MAX_MESH_PARTICLES,
  });
  if (fill.positions.length === 0) {
    throw new Error(
      "STLの内側に粒子を配置できませんでした（非水密メッシュ、または内外判定が失敗した疑いがあります。Blenderで穴を塞いでから再度書き出してください）。",
    );
  }
  seedFromMesh(fill, fileName, triangles.length, state.params);
  return {
    particleCount: fill.positions.length,
    requestedCount: fill.requestedCount,
    truncated: fill.truncated,
    scale: fill.scale,
    voxelSize: fill.voxelSize,
    triangleCount: triangles.length,
  };
}

/**
 * Consolidate any autorun-accumulated substeps into a single `run` history
 * entry, so autorun never spams the history (see history.ts's doc comment
 * on `run`). IMPORTANT: this only APPENDS the record — it does not call
 * record()/applyEntry(), because the physics for those steps has ALREADY
 * been applied directly to `state.particles` by tick()'s per-frame
 * runSteps() call (that's what autorun IS). Re-applying via record() would
 * simulate those steps a second time. Replay is still exact: replay()
 * reconstructs state purely by calling applyEntry() on each stored entry
 * from scratch, so a live-session shortcut here has no effect on replay
 * correctness — see history.ts's `run` case, which always re-simulates.
 */
function flushAutoRun(): void {
  if (autoRunAccumSteps > 0) {
    history.push({ t: Date.now(), op: "run", args: { steps: autoRunAccumSteps } });
    totalSteps += autoRunAccumSteps;
    autoRunAccumSteps = 0;
    ui.setHistoryCount(history.length);
  }
}

function refreshStatus(): void {
  ui.setParticleCount(state.particles.length);
  // Display totalSteps PLUS whatever autorun has accumulated but not yet
  // flushed into history (flushAutoRun) — the physics has already run on
  // state.particles either way, so showing only the flushed count during
  // autorun would make the counter look frozen while the sim is visibly
  // moving. The recorded history entry is still exactly totalSteps (after
  // the next flush), independent of this display.
  ui.setStepCount(totalSteps + autoRunAccumSteps);
  ui.setStatus(state.particles.length === 0 ? "未種まき" : `相=${state.params.phase.toFixed(2)}`);
}

// --- History export / import ----------------------------------------------

function exportHistory(): void {
  flushAutoRun();
  const json = serializeRecipe(history);
  downloadJson(json, `mpm-recipe-${stamp()}.json`);
}

function exportFrozenS1(): void {
  if (state.frozen.length === 0) {
    alert("まだ凍結結果がありません。");
    return;
  }
  const latest = state.frozen[state.frozen.length - 1];
  const json = serializeFrozenAsS1Recipe(latest);
  downloadJson(json, `mpm-frozen-s1-recipe-${stamp()}.json`);
}

function downloadJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function applyRecipeText(text: string): void {
  const entries = parseRecipe(text);
  history = entries;
  state = replay(entries);
  totalSteps = entries.filter((e) => e.op === "run").reduce((sum, e) => sum + (e.args as { steps: number }).steps, 0);
  autoRunAccumSteps = 0;
  gpuDirty = false;
  mpmRenderer.setGridResolution(state.params.gridN);
  syncGpuAfterStateReset();
  ui.syncParams(state.params);
  ui.setHistoryCount(history.length);
  ui.setFrozenCount(state.frozen.length);
  refreshStatus();
}

async function importHistory(file: File): Promise<void> {
  try {
    applyRecipeText(await file.text());
  } catch (err) {
    alert(`履歴の読み込みに失敗しました: ${(err as Error).message}`);
  }
}

// Debug / verification handle (mirrors S1's __cloudSculpt, S2's __gravity, S2b's __sag).
(window as unknown as Record<string, unknown>).__mpm = {
  getParticles: () => state.particles.map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz })),
  getParams: () => ({ ...state.params }),
  getHistory: () => history.map((e) => ({ ...e })),
  getSourceBalls: () => state.sourceBalls.map((b) => ({ ...b })),
  getFrozen: () => state.frozen.map((balls) => balls.map((b) => ({ ...b }))),
  getTotalSteps: () => totalSteps,
  isAutoRun: () => autoRun,
  exportJson: () => serializeRecipe(history),
  importJson: (text: string) => applyRecipeText(text),
  exportFrozenS1Json: () => (state.frozen.length > 0 ? serializeFrozenAsS1Recipe(state.frozen[state.frozen.length - 1]) : null),
  seedDefault: () => seedFrom(growBalls({ ...DEFAULT_FIELD_PARAMS }), state.params),
  /** T2f verification hook: same code path as the "STLを取り込む" file input, but takes an ArrayBuffer directly (no real File/drag-drop needed for headless verification). */
  importStlArrayBuffer: (buffer: ArrayBuffer, fileName = "debug.stl") => importStlBuffer(buffer, fileName),
  setParam: (key: keyof MpmParams, value: number | string) => {
    flushAutoRun();
    record(history, state, "setParam", { key, value });
    if (key === "gridN" && gpu) gpu.setGridResolution(state.params.gridN);
    ui.syncParams(state.params);
    refreshStatus();
  },
  runSteps: async (steps: number) => {
    flushAutoRun();
    await runPhysicsOnce(steps);
    history.push({ t: Date.now(), op: "run", args: { steps } });
    totalSteps += steps;
    ui.setHistoryCount(history.length);
    refreshStatus();
  },
  freezeNow: async () => {
    flushAutoRun();
    await ensureFullGpuSync();
    const grid = makeGrid(state.params.gridN);
    const balls = freezeParticlesToBalls(state.particles, state.params.densityKgM3, grid.dx * 3);
    record(history, state, "freeze", { balls });
    ui.setFrozenCount(state.frozen.length);
    return balls;
  },
  // --- T2e verification helpers --------------------------------------------
  getBackend: () => ({ active: backendKind, webgpuAvailable: gpuAvailable, adapterInfo: gpuAdapterInfo }),
  setBackend: async (kind: BackendKind) => {
    if (kind === backendKind) return;
    if (kind === "webgpu" && !gpuAvailable) throw new Error("WebGPU is not available in this environment");
    flushAutoRun();
    if (backendKind === "webgpu" && kind === "cpu") await ensureFullGpuSync();
    backendKind = kind;
    if (kind === "webgpu" && gpu && state.particles.length > 0) {
      gpu.upload(state.particles, state.params.gridN);
      gpuDirty = false;
    }
    ui.setBackendInfo({ active: backendKind, webgpuAvailable: gpuAvailable, detecting: false, adapterInfo: gpuAdapterInfo });
  },
  /**
   * CPU/GPU statistics comparison (T2e §1 "検算テスト... 統計量の一致、許容値
   * つき"). Seeds an independent, reproducible small particle set (NOT tied
   * to the live session's state), runs `steps` substeps identically on both
   * a fresh CPU array and a fresh, disposable GpuMpmSim, and compares
   * centroid / bounding box / total kinetic+potential-adjacent "energy"
   * (sum of 0.5*m*v^2 -- a proxy, not a rigorously conserved quantity given
   * the sim's dissipative floor friction and boundary clamps). Tolerances
   * and the actual observed numbers are recorded in README's Observation,
   * not asserted here -- this function returns raw data, it doesn't judge
   * pass/fail (AGENTS §1 "正直な計算": the report, not the code, states the
   * limits).
   */
  compareBackends: async (steps = 200, particlesPerUnitVolume = 80, phase = 0) => {
    if (!webgpuDevice) throw new Error("WebGPU is not available in this environment -- cannot compare backends");
    const testGridN = 32;
    const testParams: MpmParams = { ...DEFAULT_MPM_PARAMS, gridN: testGridN, phase, particlesPerUnitVolume };
    const balls: Ball[] = [{ id: -1, x: 0, y: 2.2, z: 0, r: 0.6 }];
    const seedParticles = seedParticlesFromBalls(balls, testParams.particlesPerUnitVolume, testParams.densityKgM3, "t2e-compare-seed");
    const clone = (src: MpmParticle[]): MpmParticle[] => src.map((p) => ({ ...p, F: [...p.F] as Mat3, C: [...p.C] as Mat3 }));

    const cpuParticles = clone(seedParticles);
    const grid = makeGrid(testGridN);
    runSteps(cpuParticles, grid, testParams, steps);

    const gpuTest = new GpuMpmSim(webgpuDevice);
    const gpuParticlesInit = clone(seedParticles);
    gpuTest.upload(gpuParticlesInit, testGridN);
    gpuTest.runSteps(testParams, DT, steps);
    const full = await gpuTest.readBackFull();
    gpuTest.dispose();

    const n = seedParticles.length;
    const stats = (xs: number[], ys: number[], zs: number[], vxs: number[], vys: number[], vzs: number[], masses: number[]) => {
      const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
      const cx = sum(xs) / n;
      const cy = sum(ys) / n;
      const cz = sum(zs) / n;
      let energy = 0;
      for (let i = 0; i < n; i++) energy += 0.5 * masses[i] * (vxs[i] ** 2 + vys[i] ** 2 + vzs[i] ** 2);
      return {
        centroid: [cx, cy, cz],
        bbox: [
          [Math.min(...xs), Math.max(...xs)],
          [Math.min(...ys), Math.max(...ys)],
          [Math.min(...zs), Math.max(...zs)],
        ],
        energy,
      };
    };

    const cpuStats = stats(
      cpuParticles.map((p) => p.x),
      cpuParticles.map((p) => p.y),
      cpuParticles.map((p) => p.z),
      cpuParticles.map((p) => p.vx),
      cpuParticles.map((p) => p.vy),
      cpuParticles.map((p) => p.vz),
      cpuParticles.map((p) => p.mass),
    );
    const gx: number[] = [];
    const gy: number[] = [];
    const gz: number[] = [];
    const gvx: number[] = [];
    const gvy: number[] = [];
    const gvz: number[] = [];
    for (let i = 0; i < n; i++) {
      gx.push(full.pos[i * 3]);
      gy.push(full.pos[i * 3 + 1]);
      gz.push(full.pos[i * 3 + 2]);
      gvx.push(full.vel[i * 3]);
      gvy.push(full.vel[i * 3 + 1]);
      gvz.push(full.vel[i * 3 + 2]);
    }
    const gpuStats = stats(gx, gy, gz, gvx, gvy, gvz, seedParticles.map((p) => p.mass));

    return {
      particleCount: n,
      steps,
      phase,
      cpu: cpuStats,
      gpu: gpuStats,
      centroidAbsDiff: [0, 1, 2].map((i) => Math.abs(cpuStats.centroid[i] - gpuStats.centroid[i])),
      energyRelDiff: Math.abs(cpuStats.energy - gpuStats.energy) / Math.max(1e-9, Math.abs(cpuStats.energy)),
    };
  },
  /** Compute-only timing for the CURRENTLY seeded+uploaded GPU particle set (waits for actual GPU completion, isolated from readback -- T2e §4). */
  benchmarkGpu: async (steps = 300) => {
    if (backendKind !== "webgpu" || !gpu) throw new Error("switch to the webgpu backend and seed particles first");
    if (state.particles.length === 0) throw new Error("no particles seeded");
    const t0 = performance.now();
    gpu.runSteps(state.params, DT, steps);
    await gpu.waitForCompletion();
    const t1 = performance.now();
    const t2 = performance.now();
    const full = await gpu.readBackFull();
    const t3 = performance.now();
    const t4 = performance.now();
    const pos = await gpu.readBackPositions();
    const t5 = performance.now();
    applyFullReadbackToParticles(state.particles, full);
    void pos;
    gpuDirty = false;
    refreshStatus();
    return {
      particleCount: state.particles.length,
      gridN: state.params.gridN,
      steps,
      computeMs: t1 - t0,
      msPerSubstep: (t1 - t0) / steps,
      fullReadbackMs: t3 - t2,
      positionsReadbackMs: t5 - t4,
    };
  },
  /** Compute-only timing for the CPU backend at the currently seeded particle count (does not switch the active backend). */
  benchmarkCpu: (steps = 300) => {
    if (state.particles.length === 0) throw new Error("no particles seeded");
    const grid = makeGrid(state.params.gridN);
    const t0 = performance.now();
    runSteps(state.particles, grid, state.params, steps);
    const t1 = performance.now();
    refreshStatus();
    return { particleCount: state.particles.length, gridN: state.params.gridN, steps, computeMs: t1 - t0, msPerSubstep: (t1 - t0) / steps };
  },
};

// --- Render loop ------------------------------------------------------

let lastFrame = performance.now();
let frameCount = 0;
let fpsAccum = 0;
// A dedicated grid, reused across autorun frames (avoids reallocating a
// gridN^3 array every rAF tick).
let liveGrid = makeGrid(state.params.gridN);

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

  if (autoRun && state.particles.length > 0) {
    // A small chunk per frame keeps the CPU path responsive (its substep
    // cost dominates frame time). On GPU, compute is cheap enough (README's
    // perf table: well under 1ms for a chunk of 8 even at 100k particles)
    // that the actual per-frame cost is the readback ROUND TRIP, not the
    // compute — and doing that round trip every single frame turned out to
    // contend badly with the WebGL render loop in this dev environment's
    // headless/software GPU path (measured: <2ms/chunk in an isolated
    // rAF loop with no renderer running, but the SAME loop dropped to
    // seconds/chunk once THREE.js's per-frame render() was also active --
    // see README's Observation). A larger GPU chunk amortizes that
    // round-trip over more simulated time per readback, which is the
    // mitigation this session landed on after measuring both — not a
    // full fix (the underlying contention is still there and needs the
    // author's native-browser session to characterize properly).
    const chunk =
      backendKind === "webgpu" && gpu ? Math.max(1, Math.min(200, state.params.substepsPerRun)) : Math.max(1, Math.min(8, state.params.substepsPerRun));
    if (backendKind === "webgpu" && gpu) {
      // GPU autorun: compute stays entirely on the GPU (runSteps below does
      // zero readback); rendering only needs POSITIONS, so that's the only
      // thing read back every frame (T2e §4 "転送コストを実測してから判断" —
      // README's transfer-cost table backs this choice: a position-only
      // readback is a fraction of a full-state one). velocity/F/C on the
      // CPU mirror go stale until ensureFullGpuSync() closes the gap (called
      // when autorun stops, before freeze, and before switching to CPU).
      // gpuBusy guards against overlapping async readbacks if a frame takes
      // longer than the GPU round-trip.
      if (!gpuBusy) {
        gpuBusy = true;
        if (gpu.getParticleCount() !== state.particles.length) gpu.upload(state.particles, state.params.gridN);
        gpu.runSteps(state.params, DT, chunk);
        gpu
          .readBackPositions()
          .then((posArr) => {
            applyPositionsToParticles(state.particles, posArr);
            autoRunAccumSteps += chunk;
            gpuDirty = true;
            refreshStatus();
            gpuBusy = false;
          })
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.error("[mpm] GPU readback failed during autorun:", err);
            gpuBusy = false;
          });
      }
    } else {
      if (liveGrid.n !== state.params.gridN) liveGrid = makeGrid(state.params.gridN);
      runSteps(state.particles, liveGrid, state.params, chunk);
      autoRunAccumSteps += chunk;
      refreshStatus();
    }
  }

  mpmRenderer.update(state.particles, state.params.phase);
  mpmRenderer.render();
}

refreshStatus();
startFrameLoop(renderFrame);

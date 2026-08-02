// ---------------------------------------------------------------------------
// S-interior-growth — entry point (Stage 1A.1, author feedback:
// docs/sonnet-instruction-20260724-katachi-interior-growth-author-feedback.md).
// Wires field.ts (host fixtures + printer presets + types) + growth.ts
// (support-constrained growth walk + void analysis) + history.ts (recipe/
// replay + legacy migration) + meshExport.ts (per-candidate STL/provenance)
// + renderer.ts (3-panel comparison view) + ui.ts.
// See README.md for Question/Setup/Observation/Hypothesis/Next.
// ---------------------------------------------------------------------------

import "./style.css";
import { startFrameLoop } from "../../lib/loop.ts";
import manifest from "./manifest.json";
import {
  computeDerivedLateralAllowance,
  findPrinterPreset,
  fitHostToBuildVolume,
  isEnvelopeValid,
  type FabricationEnvelope,
  type GrowthParams,
  type GrowthUnitKind,
  type HostFitResult,
  type HostFixtureId,
  type PrinterPreset,
  type PrinterPresetId,
  type Vec3,
} from "./field.ts";
import { summarizeMetrics, type GrowthMetrics, type GrowthResult, type GrowthVariant } from "./growth.ts";
import {
  createEmptyState,
  parseRecipe,
  record,
  replay,
  type HistoryEntry,
  type InteriorGrowthState,
} from "./history.ts";
import {
  buildCandidateMesh,
  buildProvenance,
  evaluateSaveGate,
  makeExportBaseName,
  saveCandidateProvenance,
  saveCandidateStl,
  saveRecipeJson,
  type CandidateProvenance,
  type MeshBuildResult,
  type SaveGateResult,
} from "./meshExport.ts";
import { generationContextKey, type GenerationContext } from "./generationContext.ts";
import type { GenerateRequest, GenerateStage, GrowthWorkerMessage } from "./growthWorkerProtocol.ts";
import { InteriorGrowthRenderer } from "./renderer.ts";
import { buildInteriorGrowthUi, type UiCallbacks, type UiHandles } from "./ui.ts";

const VARIANTS: GrowthVariant[] = ["field-only", "coin-constrained", "ring-constrained"];
const MESH_RESOLUTION = 64;
const VARIANT_LABEL: Record<GrowthVariant, string> = {
  "field-only": "Field only",
  "coin-constrained": "Coin",
  "ring-constrained": "Ring",
};
const STAGE_LABEL: Record<GenerateStage, string> = {
  growth: "成長",
  mesh: "メッシュ生成",
  gate: "保存ゲート判定",
};

function blendKFor(params: GrowthParams): number {
  return params.unitRadius * 0.3;
}

const app = document.getElementById("app")!;
const viewport = document.createElement("div");
viewport.id = "viewport";
app.appendChild(viewport);
// No extra wrapper div around the panel: buildInteriorGrowthUi's own
// div.panel must be a DIRECT flex child of #app (same sibling structure as
// every other Study's #viewport + .panel) so the flex cross-axis stretch +
// .panel's own overflow-y:auto actually clip/scroll it.
let panelRoot: HTMLElement | null = null;

const renderer = new InteriorGrowthRenderer(viewport);
const viewportLabels = document.createElement("div");
viewportLabels.className = "viewport-labels";
for (const variant of VARIANTS) {
  const label = document.createElement("span");
  label.textContent = renderer.panelLabels()[variant];
  viewportLabels.appendChild(label);
}
viewport.appendChild(viewportLabels);

let history: HistoryEntry[] = [];
let state: InteriorGrowthState = createEmptyState();
let showSurfaceMesh = true;
let showRejected = false;
let showVoids = false;
let showCoverageSamples = false;
let voidResolution = 26;
/** True only immediately after a legacy recipe import — reset to false on the next fresh generation (§8 "legacy migrationの有無"). */
let legacyMigratedFlag = false;

interface MeshCacheEntry {
  mesh: MeshBuildResult;
  gate: SaveGateResult;
}
const meshCache = new Map<GrowthVariant, MeshCacheEntry>();
const provenanceCache = new Map<GrowthVariant, CandidateProvenance>();

let ui: UiHandles = mountUi();

renderer.frameHost(state.hostId);
refreshAll();

function currentBuildVolumeMm(): Vec3 {
  return state.printerPresetId === "custom" ? state.customBuildVolumeMm : findPrinterPreset(state.printerPresetId).buildVolumeMm;
}

function resultsByVariant(): Partial<Record<GrowthVariant, GrowthResult>> {
  const out: Partial<Record<GrowthVariant, GrowthResult>> = {};
  for (const r of state.results) out[r.variant] = r;
  return out;
}

function meshesByVariant(): Partial<Record<GrowthVariant, MeshBuildResult>> {
  const out: Partial<Record<GrowthVariant, MeshBuildResult>> = {};
  for (const variant of VARIANTS) {
    const cached = meshCache.get(variant);
    if (cached) out[variant] = cached.mesh;
  }
  return out;
}

/**
 * Main-thread mesh build, used ONLY when replaying an imported recipe (the
 * stored results already exist, so there is nothing to grow — just mesh).
 * Generation itself goes through the Worker; this is the one remaining
 * synchronous path, and it is recorded as such in the README rather than
 * described as if everything were off-thread.
 */
function buildMeshesAndGates(): void {
  meshCache.clear();
  provenanceCache.clear();
  const blendK = blendKFor(state.params);
  const buildVolumeMm = currentBuildVolumeMm();
  const fit = fitHostToBuildVolume(state.hostId, state.envelope.buildAxis, buildVolumeMm);
  const printer = findPrinterPreset(state.printerPresetId);
  for (const result of state.results) {
    if (result.units.length === 0) continue;
    try {
      const mesh = buildCandidateMesh(result, MESH_RESOLUTION, blendK);
      const gate = evaluateSaveGate(mesh, buildVolumeMm, state.envelope.layerHeightMm);
      meshCache.set(result.variant, { mesh, gate });
      const provenance = buildProvenance(result, mesh, fit, printer, MESH_RESOLUTION, blendK, gate.topology, legacyMigratedFlag);
      provenanceCache.set(result.variant, provenance);
    } catch (err) {
      ui.setStatus(`${result.variant} のメッシュ生成に失敗しました: ${(err as Error).message}`, true);
    }
  }
}

function refreshAll(): void {
  const resultsMap = resultsByVariant();
  const blendK = blendKFor(state.params);
  const metrics: Partial<Record<GrowthVariant, GrowthMetrics>> = {};
  for (const v of VARIANTS) {
    const r = resultsMap[v];
    if (r) metrics[v] = summarizeMetrics(r, blendK, voidResolution);
  }
  ui.setMetrics(resultsMap, metrics);
  ui.setDerivedLateral(state.envelope.derivedMaxLateralAdvancePerLayerMm);
  const fit = fitHostToBuildVolume(state.hostId, state.envelope.buildAxis, currentBuildVolumeMm());
  ui.setFit(fit);
  ui.setHistoryCount(history.length);
  for (const v of VARIANTS) {
    const cached = meshCache.get(v);
    const r = resultsMap[v];
    if (cached) {
      ui.setSaveEnabled(v, cached.gate.ok, cached.gate.reasons);
    } else if (r && r.units.length === 0) {
      ui.setSaveEnabled(v, false, ["採用unitがありません"]);
    } else {
      ui.setSaveEnabled(v, false, ["未生成"]);
    }
  }
  renderer.update(
    { hostId: state.hostId, buildAxis: state.envelope.buildAxis, buildVolumeMm: currentBuildVolumeMm(), scaleMmPerUnit: fit.scaleMmPerUnit },
    resultsMap,
    meshesByVariant(),
    {
      showSurfaceMesh,
      showRejected,
      showVoids,
      showCoverageSamples,
      voidResolution,
      blendK,
      unitPointRadiusFallback: state.params.unitRadius,
    },
  );
}

// --- O3 §8: generation runs in a Worker -------------------------------------
// A run is identified by BOTH a requestId and the full snapshot of the inputs
// it was started with (see generationContext.ts for the reproduction that
// forced this). requestId alone distinguishes one run from another but says
// nothing about the conditions it ran under, so changing an input mid-run used
// to leave the run alive and let its results land in the new, different state.
//
// Two independent guards, both required:
//   A. every callback that changes a generation input calls
//      `invalidateActiveRun` BEFORE recording the new value, which terminates
//      the Worker outright — a superseded run stops computing, it is not
//      merely ignored later;
//   B. `onmessage` re-derives the current context and compares it against the
//      run's own snapshot, dropping the entire message on any mismatch, so a
//      future callback that forgets to opt into (A) still cannot mix results.
//
// The snapshot is also the SOURCE for provenance (printer/fit/blendK), rather
// than re-reading live state when the result arrives.

interface ActiveRun {
  requestId: number;
  context: GenerationContext;
  key: string;
  fit: HostFitResult;
  printer: PrinterPreset;
  startedAt: number;
}

let growthWorker: Worker | null = null;
let activeRun: ActiveRun | null = null;
let nextRequestId = 1;

function disposeWorker(): void {
  if (growthWorker) {
    growthWorker.terminate();
    growthWorker = null;
  }
}

/** The inputs a generation started right now would depend on. */
function currentGenerationContext(): GenerationContext {
  const buildVolumeMm = currentBuildVolumeMm();
  const fit = fitHostToBuildVolume(state.hostId, state.envelope.buildAxis, buildVolumeMm);
  return {
    hostId: state.hostId,
    printerPresetId: state.printerPresetId,
    buildVolumeMm: { ...buildVolumeMm },
    envelope: { ...state.envelope, buildAxis: { ...state.envelope.buildAxis } },
    params: { ...state.params },
    canonicalScaleMmPerUnit: fit.scaleMmPerUnit,
    variants: isEnvelopeValid(state.envelope) ? [...VARIANTS] : ["field-only"],
    meshResolution: MESH_RESOLUTION,
    blendK: blendKFor(state.params),
  };
}

/**
 * Called by EVERY callback that changes a generation input, before it records
 * the new value. Terminating here is the point: a run whose conditions no
 * longer exist should stop, not finish and be discarded.
 */
function invalidateActiveRun(): void {
  if (!activeRun) return;
  disposeWorker();
  activeRun = null;
  ui.setProgress(null);
  ui.setStatus("生成条件が変わったため、実行中の生成を中止しました。新しい条件で再生成してください。");
}

function cancelGenerate(): void {
  if (!activeRun) return;
  disposeWorker();
  activeRun = null;
  ui.setProgress(null);
  ui.setStatus("生成を中止しました（結果は反映していません）");
}

function generateCandidates(): void {
  legacyMigratedFlag = false;
  const context = currentGenerationContext();
  const fit = fitHostToBuildVolume(context.hostId, context.envelope.buildAxis, context.buildVolumeMm);
  const printer = findPrinterPreset(context.printerPresetId);

  disposeWorker();
  const requestId = nextRequestId++;
  const run: ActiveRun = {
    requestId,
    context,
    key: generationContextKey(context),
    fit,
    printer,
    startedAt: performance.now(),
  };
  activeRun = run;
  ui.setProgress({ candidateIndex: 1, candidateTotal: context.variants.length, label: VARIANT_LABEL[context.variants[0]], stage: "準備中", completed: 0, total: 0, elapsedMs: 0 });
  ui.setStatus("");

  const worker = new Worker(new URL("./growth.worker.ts", import.meta.url), { type: "module" });
  growthWorker = worker;

  /**
   * A message may only be acted on when it belongs to the run we are still
   * waiting for AND that run's own input snapshot still matches what is
   * selected now. The second half is what stops a mid-run input change from
   * mixing results — see generationContext.ts.
   */
  const messageIsCurrent = (message: GrowthWorkerMessage): boolean =>
    activeRun !== null && message.requestId === activeRun.requestId && activeRun.key === generationContextKey(currentGenerationContext());

  worker.onmessage = (event: MessageEvent<GrowthWorkerMessage>) => {
    const message = event.data;
    if (!messageIsCurrent(message)) {
      // Dropped whole. Nothing below this line runs, so state.results,
      // meshCache, provenanceCache, the renderer, the save gate and the
      // history entry are all left exactly as they were.
      if (activeRun && message.requestId === activeRun.requestId) invalidateActiveRun();
      return;
    }

    if (message.type === "progress") {
      ui.setProgress({
        candidateIndex: message.candidateIndex,
        candidateTotal: message.candidateTotal,
        label: VARIANT_LABEL[message.variant],
        stage: STAGE_LABEL[message.stage],
        completed: message.completed,
        total: message.total,
        elapsedMs: message.elapsedMs,
      });
      return;
    }

    if (message.type === "error") {
      activeRun = null;
      disposeWorker();
      ui.setProgress(null);
      ui.setStatus(`生成に失敗しました: ${message.message}`, true);
      return;
    }

    activeRun = null;
    disposeWorker();
    ui.setProgress(null);

    const results: GrowthResult[] = [];
    meshCache.clear();
    provenanceCache.clear();
    // Provenance is built from the RUN'S OWN snapshot (printer/fit/blendK/
    // resolution), never re-read from live state at arrival time — correction
    // doc §1.2B.
    for (const candidate of message.candidates) {
      results.push(candidate.result);
      if (candidate.meshError) {
        ui.setStatus(`${candidate.result.variant} のメッシュ生成に失敗しました: ${candidate.meshError}`, true);
        continue;
      }
      if (!candidate.mesh || !candidate.gate) continue;
      meshCache.set(candidate.result.variant, { mesh: candidate.mesh, gate: candidate.gate });
      provenanceCache.set(
        candidate.result.variant,
        buildProvenance(candidate.result, candidate.mesh, run.fit, run.printer, run.context.meshResolution, run.context.blendK, candidate.gate.topology, legacyMigratedFlag),
      );
    }
    record(history, state, "generateCandidates", { results });
    refreshAll();
    const total = results.reduce((sum, r) => sum + r.units.length, 0);
    const wallMs = performance.now() - run.startedAt;
    const computeMs = message.candidates.reduce((sum, c) => sum + c.growthMs + c.meshMs, 0);
    // §8: real compute time and main-thread responsiveness reported
    // separately. Moving work to a Worker did not make it faster.
    ui.setStatus(
      `生成完了: ${results.length}候補 / 合計accepted ${total} unit — Worker実処理 ${(computeMs / 1000).toFixed(1)} 秒（内訳 growth ${(message.candidates.reduce((s, c) => s + c.growthMs, 0) / 1000).toFixed(1)}s / mesh ${(message.candidates.reduce((s, c) => s + c.meshMs, 0) / 1000).toFixed(1)}s）、実時間 ${(wallMs / 1000).toFixed(1)} 秒。この間main threadは応答を保つ`,
    );
  };

  worker.onerror = (event) => {
    if (!activeRun || activeRun.requestId !== requestId) return;
    activeRun = null;
    disposeWorker();
    ui.setProgress(null);
    ui.setStatus(`生成Workerでエラーが発生しました: ${event.message}`, true);
  };

  // The request carries the SNAPSHOT, not live state — so even the values the
  // Worker grows from cannot drift out from under it.
  const request: GenerateRequest = {
    type: "generate",
    requestId,
    hostId: context.hostId,
    envelope: context.envelope,
    params: context.params,
    variants: context.variants,
    canonicalScaleMmPerUnit: context.canonicalScaleMmPerUnit,
    buildVolumeMm: context.buildVolumeMm,
    meshResolution: context.meshResolution,
    blendK: context.blendK,
  };
  worker.postMessage(request);
}

function saveStl(variant: GrowthVariant): void {
  const cached = meshCache.get(variant);
  if (!cached) {
    ui.setStatus(`${variant}: メッシュが未生成です`, true);
    return;
  }
  if (!cached.gate.ok) {
    ui.setStatus(`${variant}: 保存後topology不合格のためSTLは提供できません（${cached.gate.reasons.join(" / ")}）`, true);
    return;
  }
  const baseName = makeExportBaseName(state.hostId);
  saveCandidateStl(cached.mesh, baseName, variant, cached.gate)
    .then((sha256) => {
      const provenance = provenanceCache.get(variant);
      if (provenance) provenance.savedStlSha256 = sha256;
      ui.setStatus(`${variant}: STL保存完了 (SHA-256 ${sha256.slice(0, 12)}…)`);
    })
    .catch((err: Error) => ui.setStatus(`${variant}: STL保存に失敗しました: ${err.message}`, true));
}

function saveProvenance(variant: GrowthVariant): void {
  const provenance = provenanceCache.get(variant);
  if (!provenance) {
    ui.setStatus(`${variant}: provenanceが未生成です`, true);
    return;
  }
  const baseName = makeExportBaseName(state.hostId);
  saveCandidateProvenance(provenance, baseName, variant);
  ui.setStatus(`${variant}: provenance保存完了`);
}

function mountUi(): UiHandles {
  if (panelRoot) app.removeChild(panelRoot);
  const callbacks: UiCallbacks = {
    onPrinterPresetChange: (printerPresetId: PrinterPresetId) => {
      invalidateActiveRun();
      record(history, state, "setPrinterPreset", { printerPresetId });
      refreshAll();
    },
    onCustomBuildVolumeChange: (axis, valueMm) => {
      invalidateActiveRun();
      const buildVolumeMm: Vec3 = { ...state.customBuildVolumeMm, [axis]: valueMm };
      record(history, state, "setCustomBuildVolume", { buildVolumeMm });
      refreshAll();
    },
    onHostChange: (hostId: HostFixtureId) => {
      invalidateActiveRun();
      record(history, state, "setHost", { hostId });
      renderer.frameHost(hostId);
      refreshAll();
    },
    onBuildAxisChange: (axis) => {
      invalidateActiveRun();
      const buildAxis = { x: axis === "x" ? 1 : 0, y: axis === "y" ? 1 : 0, z: axis === "z" ? 1 : 0 };
      const envelope: FabricationEnvelope = { ...state.envelope, buildAxis };
      record(history, state, "setEnvelope", { envelope });
      refreshAll();
    },
    onLayerHeightChange: (mm) => {
      invalidateActiveRun();
      const envelope: FabricationEnvelope = {
        ...state.envelope,
        layerHeightMm: mm,
        derivedMaxLateralAdvancePerLayerMm: computeDerivedLateralAllowance(mm, state.envelope.supportThresholdAngleDeg),
      };
      record(history, state, "setEnvelope", { envelope });
      refreshAll();
    },
    onSupportThresholdAngleChange: (deg) => {
      invalidateActiveRun();
      const envelope: FabricationEnvelope = {
        ...state.envelope,
        supportThresholdAngleDeg: deg,
        derivedMaxLateralAdvancePerLayerMm: computeDerivedLateralAllowance(state.envelope.layerHeightMm, deg),
      };
      record(history, state, "setEnvelope", { envelope });
      refreshAll();
    },
    onTargetSurfaceCoverageChange: (fraction) => {
      invalidateActiveRun();
      const params: GrowthParams = { ...state.params, targetSurfaceCoverage: fraction };
      record(history, state, "setParams", { params });
      refreshAll();
    },
    onParamChange: (key, value) => {
      invalidateActiveRun();
      const params: GrowthParams = { ...state.params, [key]: value };
      record(history, state, "setParams", { params });
      refreshAll();
    },
    onSeedChange: (seed) => {
      invalidateActiveRun();
      const params: GrowthParams = { ...state.params, seed };
      record(history, state, "setParams", { params });
      refreshAll();
    },
    onUnitKindChange: (kind: GrowthUnitKind) => {
      invalidateActiveRun();
      const params: GrowthParams = { ...state.params, unitKind: kind };
      record(history, state, "setParams", { params });
      refreshAll();
    },
    onGenerate: () => generateCandidates(),
    onCancelGenerate: () => cancelGenerate(),
    onToggleSurfaceMesh: (show) => {
      showSurfaceMesh = show;
      refreshAll();
    },
    onToggleRejected: (show) => {
      showRejected = show;
      refreshAll();
    },
    onToggleVoids: (show) => {
      showVoids = show;
      refreshAll();
    },
    onToggleCoverageSamples: (show) => {
      showCoverageSamples = show;
      refreshAll();
    },
    onVoidResolutionChange: (value) => {
      voidResolution = value;
      refreshAll();
    },
    onExportRecipe: () => saveRecipeJson(history, makeExportBaseName(state.hostId)),
    onImportRecipeFile: (file: File) => {
      // Invalidate up front: a replay replaces host/envelope/params wholesale,
      // and mountUi() below rebuilds the panel, so an in-flight run would
      // otherwise finish against a state that no longer exists AND against a
      // discarded `ui` handle.
      invalidateActiveRun();
      file
        .text()
        .then((text) => {
          const { entries, legacyMigrated } = parseRecipe(text);
          invalidateActiveRun();
          history = entries;
          state = replay(entries);
          legacyMigratedFlag = legacyMigrated;
          buildMeshesAndGates();
          ui = mountUi();
          renderer.frameHost(state.hostId);
          refreshAll();
          ui.setStatus(`recipe読み込み完了（${entries.length}件）${legacyMigrated ? " — 旧Phase 1A形式からmigrationしました" : ""}`);
        })
        .catch((err: Error) => ui.setStatus(`recipe読み込みに失敗しました: ${err.message}`, true));
    },
    onSaveStl: (variant) => saveStl(variant),
    onSaveProvenance: (variant) => saveProvenance(variant),
    onClear: () => {
      invalidateActiveRun();
      record(history, state, "clear", {});
      meshCache.clear();
      provenanceCache.clear();
      refreshAll();
    },
  };
  const handles = buildInteriorGrowthUi(
    app,
    state.hostId,
    state.envelope,
    state.params,
    state.printerPresetId,
    state.customBuildVolumeMm,
    manifest.version,
    manifest.updatedAt,
    callbacks,
  );
  panelRoot = handles.root;
  return handles;
}

startFrameLoop(() => {
  renderer.render();
});

// Read-only verification handle (used solely to read state during
// browser-based verification, same convention as skin's window.__skin —
// never used to drive an action).
(window as unknown as { __interiorGrowth: unknown }).__interiorGrowth = {
  getState: () => state,
  getResultsByVariant: () => resultsByVariant(),
  getMeshCache: () => meshCache,
  getRenderer: () => renderer,
  getCamera: () => renderer.camera,
};

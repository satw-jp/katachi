import {
  captureFkei,
  FKEI_SCHEMA,
  parseFkeiDocument,
  serializeFkei,
  type FkeiArtworkBinding,
  type FkeiBindingFacts,
  type FkeiCaptureInput,
  type FkeiCompatibility,
  type FkeiCompletedStage,
  type FkeiDocument,
  type FkeiDryWebArtifact,
  type FkeiPrintProfileArtifact,
  type FkeiShapeArtifact,
  type FkeiSupportPaintArtifact,
  type FkeiSurfaceBinding,
  type FkeiSurfaceArtifact,
} from "./fkei.ts";
import type { FkeiCanonicalDryWebArtifact, FkeiRiskDrivenLatticeArtifact } from "./fkeiRiskDrivenLattice.ts";

/**
 * Runtime-save adapters deliberately receive currentness decisions made by
 * main.ts.  This module only assembles a detached prefix and runs the
 * existing codec/validator; it never hashes or decides whether runtime data
 * is current.
 */
export interface FkeiRuntimeSaveArtifact<T> {
  readonly value: T;
  readonly current: boolean;
}

/** Facts gathered by main.ts from the already accepted runtime state.  The
 * accepted Surface binding is intentionally separate from the current UI
 * binding: the adapter can then fail closed on any binding drift without
 * deriving a second fingerprint or invalidating runtime state. */
export interface FkeiRuntimeSurfaceFacts {
  readonly value: FkeiSurfaceArtifact;
  /** Existing Surface predicate/idle result supplied by main.ts. */
  readonly current: boolean;
  readonly acceptedBinding: FkeiSurfaceBinding | null;
  readonly currentBinding: FkeiSurfaceBinding;
  /** Existing support-paint Surface cache context, when it belongs to this diagnosis. */
  readonly supportPaintSurfaceTargetLongestMm?: number;
}

export interface FkeiRuntimeSaveStageCurrentness {
  readonly 1: boolean;
  readonly 2: boolean;
  readonly 3: boolean;
  readonly 4: boolean;
  readonly 5: boolean;
  readonly 6: boolean;
  readonly 7: boolean;
}

export interface FkeiRuntimeSaveSnapshot {
  readonly shape: FkeiShapeArtifact;
  readonly bindings: FkeiBindingFacts;
  readonly stageCurrent: FkeiRuntimeSaveStageCurrentness;
  readonly supportPaint?: FkeiRuntimeSaveArtifact<FkeiSupportPaintArtifact>;
  readonly artworkGraph?: FkeiRuntimeSaveArtifact<NonNullable<FkeiDocument["artworkGraph"]>>;
  readonly surface?: FkeiRuntimeSaveArtifact<FkeiSurfaceArtifact>;
  readonly dryWeb?: FkeiRuntimeSaveArtifact<FkeiDryWebArtifact>;
  readonly canonicalDryWeb?: FkeiRuntimeSaveArtifact<FkeiCanonicalDryWebArtifact>;
  readonly riskDrivenLattice?: FkeiRuntimeSaveArtifact<FkeiRiskDrivenLatticeArtifact>;
  readonly printProfile?: FkeiRuntimeSaveArtifact<FkeiPrintProfileArtifact>;
  readonly compatibility?: Partial<FkeiCompatibility>;
}

/** Runtime-to-save decision boundary.  This is pure and contains no DOM,
 * Worker, timer, renderer, cache-write, or currentness derivation logic. */
export interface FkeiRuntimeSaveFacts {
  readonly shape: FkeiShapeArtifact;
  readonly bindings: FkeiBindingFacts;
  readonly stageCurrent: FkeiRuntimeSaveStageCurrentness;
  readonly supportPaint?: FkeiRuntimeSaveArtifact<FkeiSupportPaintArtifact>;
  readonly artworkGraph?: FkeiRuntimeSaveArtifact<NonNullable<FkeiDocument["artworkGraph"]>>;
  readonly surface?: FkeiRuntimeSurfaceFacts;
  readonly dryWeb?: FkeiRuntimeSaveArtifact<FkeiDryWebArtifact>;
  readonly canonicalDryWeb?: FkeiRuntimeSaveArtifact<FkeiCanonicalDryWebArtifact>;
  readonly riskDrivenLattice?: FkeiRuntimeSaveArtifact<FkeiRiskDrivenLatticeArtifact>;
  readonly printProfile?: FkeiRuntimeSaveArtifact<FkeiPrintProfileArtifact>;
  readonly compatibility?: Partial<FkeiCompatibility>;
}

export interface FkeiRuntimeSaveAssembly {
  readonly input: FkeiCaptureInput;
  readonly completedStage: FkeiCompletedStage | undefined;
  readonly omitted: readonly string[];
}

export interface FkeiRuntimeSaveOptions {
  readonly savedAt?: Date;
  readonly download: (text: string, filename: string) => void;
}

export interface FkeiRuntimeSaveResult {
  readonly document: FkeiDocument;
  readonly text: string;
  readonly filename: string;
  readonly completedStage: FkeiCompletedStage | undefined;
  readonly omitted: readonly string[];
}

function cloneDetached<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof ArrayBuffer) return value.slice(0) as T;
  if (ArrayBuffer.isView(value)) {
    const view = value as unknown as { slice?: () => unknown };
    if (typeof view.slice !== "function") throw new Error("FKEI save cannot detach this binary value");
    return view.slice() as T;
  }
  if (Array.isArray(value)) return value.map((item) => cloneDetached(item)) as T;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = cloneDetached(item);
  }
  return result as T;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (ArrayBuffer.isView(left) || ArrayBuffer.isView(right)) {
    if (!ArrayBuffer.isView(left) || !ArrayBuffer.isView(right)) return false;
    const a = left as unknown as { length: number; [index: number]: number };
    const b = right as unknown as { length: number; [index: number]: number };
    if (a.constructor !== b.constructor || a.length !== b.length) return false;
    for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameValue(value, right[index]));
  }
  const leftKeys = Object.keys(left as object);
  const rightKeys = Object.keys(right as object);
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key) => !rightKeys.includes(key))) return false;
  return leftKeys.every((key) => sameValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

function sameSurfaceBinding(left: FkeiSurfaceBinding, right: FkeiSurfaceBinding): boolean {
  return left.surfaceFingerprint === right.surfaceFingerprint
    && left.resolution === right.resolution
    && left.targetLongestMm === right.targetLongestMm
    && left.angleThresholdDeg === right.angleThresholdDeg
    && sameValue(left.cacheKeys, right.cacheKeys);
}

/**
 * targetedGrid can legitimately quantize a Surface target onto the same
 * material node.  Its generator then has no non-zero edge to cite, so the
 * runtime fact must not be persisted as an evidenced `connected` fact.  The
 * save clone records only what the graph can prove: that target is unresolved.
 * Runtime graph/facts remain untouched.
 */
function normalizeDryWebTargetEvidenceForSave(dryWeb: FkeiDryWebArtifact): FkeiDryWebArtifact {
  const graph = dryWeb.preview.graph;
  if (graph.kind !== "targetedGrid") return dryWeb;

  const normalize = (
    facts: NonNullable<FkeiDryWebArtifact["preview"]["targetConnectionFacts"]>,
  ): { facts: NonNullable<FkeiDryWebArtifact["preview"]["targetConnectionFacts"]>; changed: boolean } => {
    let changed = false;
    const normalized = facts.map((fact) => {
      if (fact.status !== "connected"
        || fact.edgeId !== null
        || fact.contactNodeId === null
        || fact.contactNodeId !== fact.materialNodeId) return fact;
      changed = true;
      return {
        sourceTargetIndex: fact.sourceTargetIndex,
        contactNodeId: null,
        materialNodeId: null,
        edgeId: null,
        status: "unresolved" as const,
      };
    });
    return { facts: normalized, changed };
  };

  const active = dryWeb.preview.targetConnectionFacts === null
    ? null
    : normalize(dryWeb.preview.targetConnectionFacts);
  const adoption = dryWeb.preview.canonicalAdoption
    ? normalize(dryWeb.preview.canonicalAdoption.targetConnectionFacts)
    : null;
  if (!active?.changed && !adoption?.changed) return dryWeb;

  const effectiveFacts = active?.facts ?? adoption?.facts;
  const contactFacts = (graph.stats as typeof graph.stats & {
    dryWebContactFacts?: { readonly componentCount: number; readonly mainComponentSize: number };
  }).dryWebContactFacts;
  const connectedFactCount = effectiveFacts?.filter((fact) => fact.status === "connected").length;
  const connectedTargets = contactFacts && connectedFactCount !== undefined
    ? contactFacts.componentCount === 1
      ? connectedFactCount
      : Math.min(connectedFactCount, contactFacts.mainComponentSize)
    : graph.stats.connectedTargets;

  return {
    ...dryWeb,
    preview: {
      ...dryWeb.preview,
      graph: { ...graph, stats: { ...graph.stats, connectedTargets } },
      ...(active ? { targetConnectionFacts: active.facts } : {}),
      ...(dryWeb.preview.canonicalAdoption && adoption ? {
        canonicalAdoption: {
          ...dryWeb.preview.canonicalAdoption,
          targetConnectionFacts: adoption.facts,
        },
      } : {}),
    },
  };
}

function currentStagePrefix(current: FkeiRuntimeSaveStageCurrentness): FkeiCompletedStage | undefined {
  let completed: FkeiCompletedStage | undefined;
  // The unchanged document has no restoration contracts for Candidate/
  // Confirmed editing (Stage 5), mesh (Stage 6), or Stage 7.  Optional facts
  // may still be persisted, but the continuous resumable prefix stops at 4.
  for (const stage of [1, 2, 3, 4] as const) {
    if (!current[stage]) break;
    completed = stage;
  }
  return completed;
}

function surfaceBindingMatchesDryWeb(
  bindings: FkeiBindingFacts,
  surface: FkeiSurfaceArtifact | undefined,
  dryWeb: FkeiDryWebArtifact,
): boolean {
  const surfaceBinding = bindings.surface;
  if (!surfaceBinding || !surface) return false;
  const preview = dryWeb.preview;
  return preview.surfaceFingerprint === surfaceBinding.surfaceFingerprint
    && preview.resolution === surfaceBinding.resolution
    && dryWeb.targetSource.surfaceFingerprint === surfaceBinding.surfaceFingerprint
    && dryWeb.targetSource.resolution === surfaceBinding.resolution
    && (dryWeb.exactBinding === undefined || sameSurfaceBinding(dryWeb.exactBinding, surfaceBinding));
}

function artworkBindingMatchesDryWeb(
  bindings: FkeiBindingFacts,
  artwork: NonNullable<FkeiDocument["artworkGraph"]> | undefined,
  dryWeb: FkeiDryWebArtifact,
): boolean {
  const artworkBinding = bindings.artworkGraph;
  if (!artworkBinding || !artwork) return false;
  const preview = dryWeb.preview;
  return preview.artworkGraphSourceKey === artworkBinding.sourceKey
    && preview.artworkGraphSourceKey === artwork.sourceKey
    && preview.artworkGraphSnapshot !== undefined
    && sameValue(preview.artworkGraphSnapshot, artwork.snapshot);
}

/**
 * Pure Runtime -> Save boundary.  `main.ts` supplies the existing currentness
 * decisions and the accepted/current Surface binding facts; this function only
 * applies the exact binding contract and makes downstream artifacts dependent
 * on the admitted prerequisites.
 */
export function buildFkeiRuntimeSaveSnapshot(facts: FkeiRuntimeSaveFacts): FkeiRuntimeSaveSnapshot {
  const bindings = cloneDetached(facts.bindings);
  const acceptedSurface = facts.surface?.acceptedBinding;
  const surfaceBindingCurrent = Boolean(
    facts.surface
    && facts.surface.current
    && acceptedSurface
    && sameSurfaceBinding(facts.surface.value.binding, acceptedSurface)
    && sameSurfaceBinding(acceptedSurface, facts.surface.currentBinding)
    && (facts.surface.supportPaintSurfaceTargetLongestMm === undefined
      || facts.surface.supportPaintSurfaceTargetLongestMm === facts.surface.currentBinding.targetLongestMm),
  );
  const artworkCurrent = facts.artworkGraph?.current === true;
  const dryWebCurrent = Boolean(facts.dryWeb?.current && surfaceBindingCurrent && artworkCurrent);
  const stageCurrent: FkeiRuntimeSaveStageCurrentness = {
    ...facts.stageCurrent,
    5: false,
    6: false,
    7: false,
  };
  return {
    shape: facts.shape,
    bindings,
    stageCurrent,
    ...(facts.supportPaint ? { supportPaint: facts.supportPaint } : {}),
    ...(facts.artworkGraph ? { artworkGraph: facts.artworkGraph } : {}),
    ...(facts.surface ? { surface: { current: surfaceBindingCurrent, value: facts.surface.value } } : {}),
    ...(facts.dryWeb ? {
      dryWeb: {
        current: dryWebCurrent,
        value: normalizeDryWebTargetEvidenceForSave(facts.dryWeb.value),
      },
    } : {}),
    ...(facts.canonicalDryWeb ? { canonicalDryWeb: facts.canonicalDryWeb } : {}),
    ...(facts.riskDrivenLattice ? { riskDrivenLattice: facts.riskDrivenLattice } : {}),
    ...(facts.printProfile ? { printProfile: facts.printProfile } : {}),
    ...(facts.compatibility ? { compatibility: facts.compatibility } : {}),
  };
}

/** Assemble a detached input and the highest continuous current prefix. */
export function assembleFkeiCaptureInput(snapshot: FkeiRuntimeSaveSnapshot): FkeiRuntimeSaveAssembly {
  const omitted: string[] = [];
  const bindings = cloneDetached(snapshot.bindings);
  const input: FkeiCaptureInput = {
    bindings,
    shape: cloneDetached(snapshot.shape),
  };

  const supportPaint = snapshot.supportPaint;
  if (supportPaint?.current && supportPaint.value.revision === bindings.paintRevision) {
    input.supportPaint = cloneDetached(supportPaint.value);
  } else if (supportPaint) {
    omitted.push("supportPaint");
  }

  const artworkGraph = snapshot.artworkGraph;
  if (artworkGraph?.current) {
    input.artworkGraph = cloneDetached(artworkGraph.value);
    input.bindings.artworkGraph = {
      sourceKey: artworkGraph.value.sourceKey,
      patchSetRevision: artworkGraph.value.snapshot.surfaceDraft.patchSetRevision,
    } satisfies FkeiArtworkBinding;
  } else if (artworkGraph) {
    omitted.push("artworkGraph");
    delete input.bindings.artworkGraph;
  }

  const surface = snapshot.surface;
  if (surface?.current) {
    input.surface = cloneDetached(surface.value);
    input.bindings.surface = cloneDetached(surface.value.binding);
  } else if (surface) {
    omitted.push("surface");
    delete input.bindings.surface;
  }

  const dryWeb = snapshot.dryWeb;
  if (dryWeb?.current
    && surfaceBindingMatchesDryWeb(input.bindings, input.surface, dryWeb.value)
    && artworkBindingMatchesDryWeb(input.bindings, input.artworkGraph, dryWeb.value)
    && dryWeb.value.preview.paintRevision === input.bindings.paintRevision) {
    input.dryWeb = cloneDetached(dryWeb.value);
    input.bindings.dryWeb = {
      surfaceFingerprint: dryWeb.value.preview.surfaceFingerprint,
      resolution: dryWeb.value.preview.resolution,
      paintRevision: dryWeb.value.preview.paintRevision,
      artworkGraphSourceKey: dryWeb.value.preview.artworkGraphSourceKey,
      targetSourceResolution: dryWeb.value.targetSource.resolution,
    };
  } else if (dryWeb) {
    omitted.push("dryWeb");
    delete input.bindings.dryWeb;
  }

  const printProfile = snapshot.printProfile;
  if (printProfile?.current) input.printProfile = cloneDetached(printProfile.value);
  else if (printProfile) omitted.push("printProfile");

  if (!input.artworkGraph) delete input.bindings.artworkGraph;
  if (!input.surface) delete input.bindings.surface;
  if (!input.dryWeb) delete input.bindings.dryWeb;

  const canonical = snapshot.canonicalDryWeb;
  const lattice = snapshot.riskDrivenLattice;
  if (canonical?.current && lattice?.current
    && input.surface
    && canonical.value.inputBinding.shapeFingerprint === bindings.shapeFingerprint
    && canonical.value.inputBinding.patchSetRevision === bindings.patchSetRevision
    && canonical.value.inputBinding.paintRevision === bindings.paintRevision
    && canonical.value.inputBinding.artworkGraphSourceKey === input.artworkGraph?.sourceKey
    && canonical.value.inputBinding.surfaceResolution === input.surface.binding.resolution
    && canonical.value.inputBinding.surfaceTargetLongestMm === input.surface.binding.targetLongestMm
    && canonical.value.inputBinding.surfaceAngleThresholdDeg === input.surface.binding.angleThresholdDeg
    && canonical.value.inputBinding.exactDiagnosisProvenanceSha256 === canonical.value.exactDiagnosisSummary.provenanceSha256
    && lattice.value.inputBinding.shapeFingerprint === bindings.shapeFingerprint
    && lattice.value.inputBinding.canonicalRequestSha256 === canonical.value.inputBinding.canonicalRequestSha256) {
    input.canonicalDryWeb = cloneDetached(canonical.value);
    input.riskDrivenLattice = cloneDetached(lattice.value);
    input.completedStage = 4;
  } else if (canonical || lattice) {
    omitted.push("riskDrivenLattice");
  }

  // Artifact omission is itself a downstream boundary: a caller cannot claim
  // a stage whose restorable artifact was not admitted, even if an upstream
  // currentness bit was accidentally left true.
  const effectiveStageCurrent: Record<FkeiCompletedStage, boolean> = {
    ...snapshot.stageCurrent,
  };
  if (!input.artworkGraph) {
    effectiveStageCurrent[3] = false;
    effectiveStageCurrent[4] = false;
    effectiveStageCurrent[5] = false;
    effectiveStageCurrent[7] = false;
  }
  if (!input.surface) {
    effectiveStageCurrent[6] = false;
    effectiveStageCurrent[7] = false;
  }
  if (!input.dryWeb && !(input.canonicalDryWeb && input.riskDrivenLattice)) {
    effectiveStageCurrent[4] = false;
    effectiveStageCurrent[5] = false;
    effectiveStageCurrent[7] = false;
  }
  const completedStage = currentStagePrefix(effectiveStageCurrent);
  if (completedStage !== undefined) input.completedStage = completedStage;
  input.compatibility = cloneDetached(snapshot.compatibility ?? {});
  return { input, completedStage, omitted };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local-author-time filename; the Date is injectable for deterministic tests. */
export function formatFkeiFilename(date: Date): string {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error("FKEI save requires a valid date");
  return `skin-project-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.fkei`;
}

export const makeFkeiFilename = formatFkeiFilename;

/** Validate twice through the existing capture/codec/parser before download. */
export function saveFkeiRuntime(
  snapshot: FkeiRuntimeSaveSnapshot,
  options: FkeiRuntimeSaveOptions,
): FkeiRuntimeSaveResult {
  let assembly = assembleFkeiCaptureInput(snapshot);
  let captured: FkeiDocument;
  try {
    captured = captureFkei(assembly.input);
  } catch (error) {
    // A current runtime Dry Web may still be unrepresentable by the existing
    // immutable .fkei validator (for example, one patch's multiple contact
    // nodes can span graph components).  Never reshape that graph merely to
    // make it serializable.  Preserve the independently valid prefix and
    // lower the resumable stage instead.
    if (!assembly.input.dryWeb) throw error;
    const input = cloneDetached(assembly.input);
    delete input.dryWeb;
    delete input.bindings.dryWeb;
    const completedStage = assembly.completedStage !== undefined && assembly.completedStage >= 4
      ? 3 as const
      : assembly.completedStage;
    if (completedStage === undefined) delete input.completedStage;
    else input.completedStage = completedStage;
    assembly = {
      input,
      completedStage,
      omitted: [...assembly.omitted, "dryWeb:validation"],
    };
    captured = captureFkei(input);
  }
  const text = serializeFkei(captured);
  const parsed = parseFkeiDocument(text);
  if (parsed.schema !== FKEI_SCHEMA) throw new Error("FKEI save self-validation returned the wrong schema");
  const filename = formatFkeiFilename(options.savedAt ?? new Date());
  options.download(text, filename);
  return {
    document: parsed,
    text,
    filename,
    completedStage: assembly.completedStage,
    omitted: assembly.omitted,
  };
}

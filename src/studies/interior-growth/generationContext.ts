// ---------------------------------------------------------------------------
// The identity of ONE generation run's input conditions.
//
// Why this exists (Optimizer/docs/opus-correction-20260725-katachi-interior-
// growth-worker-state-and-plate-metrics.md §1): the Worker handshake used to
// guard results with `requestId` alone. A requestId distinguishes one RUN from
// another, but it says nothing about the conditions the run was started under.
// So changing an input WHILE a run was in flight left the run alive, and its
// results were accepted into the new, different state.
//
// Independently reproduced with real clicks before this fix: host=box,
// target=25%, press generate, switch host to sphere mid-run, wait. The panel
// then showed "合計accepted 1513 unit" against a sphere selection — 1513 is
// box's own 530+436+547, where sphere's own default is 486+625+288=1399 — and
// the meshes/save gates computed for box were attached to the sphere state.
//
// The fix has two halves, and this module is the part that can be tested
// without a DOM (§1.4 "ロジックをUIから分離し"):
//   - `generationContextKey` reduces every input a result depends on to one
//     deterministic string, so main.ts can compare "what this run was started
//     with" against "what is selected right now" at the moment a result
//     arrives, and drop the whole message on any mismatch;
//   - main.ts additionally terminates the Worker the instant any of those
//     inputs changes, so a superseded run stops burning CPU instead of merely
//     being ignored later.
//
// Both halves are required. The callback-side invalidation alone would be a
// promise that every future input callback remembers to opt in; the key check
// alone would let a superseded run keep running to completion.
// ---------------------------------------------------------------------------

import type { FabricationEnvelope, GrowthParams, HostFixtureId, PrinterPresetId, Vec3 } from "./field.ts";
import type { GrowthVariant } from "./growth.ts";

/**
 * Every input a generated candidate depends on. Deliberately the FULL set
 * named in the correction doc §1.2B rather than "the ones that seemed to
 * matter" — a field left out here is a field whose change can silently mix
 * results again.
 */
export interface GenerationContext {
  hostId: HostFixtureId;
  printerPresetId: PrinterPresetId;
  buildVolumeMm: Vec3;
  envelope: FabricationEnvelope;
  params: GrowthParams;
  canonicalScaleMmPerUnit: number;
  variants: GrowthVariant[];
  meshResolution: number;
  blendK: number;
}

/** Fixed-precision so a value that round-trips through structured clone or JSON can't differ in its last bit and spuriously invalidate a run. 6 decimals is far finer than any input the author can express. */
function num(n: number): string {
  return Number.isFinite(n) ? n.toFixed(6) : `nf:${String(n)}`;
}

/**
 * A deterministic identity string for `context`. Two contexts produce the same
 * key exactly when every field that can change a generated candidate is equal.
 *
 * Written by hand rather than via `JSON.stringify` because stringify's output
 * depends on key insertion order — two structurally identical states built
 * along different code paths (a fresh default vs. a recipe replay) could
 * serialize differently and be treated as a mismatch.
 */
export function generationContextKey(context: GenerationContext): string {
  const e = context.envelope;
  const p = context.params;
  return [
    `host=${context.hostId}`,
    `printer=${context.printerPresetId}`,
    `volume=${num(context.buildVolumeMm.x)},${num(context.buildVolumeMm.y)},${num(context.buildVolumeMm.z)}`,
    `axis=${num(e.buildAxis.x)},${num(e.buildAxis.y)},${num(e.buildAxis.z)}`,
    `layer=${num(e.layerHeightMm)}`,
    `angle=${num(e.supportThresholdAngleDeg)}`,
    `lateral=${num(e.derivedMaxLateralAdvancePerLayerMm)}`,
    `seed=${p.seed}`,
    `kind=${p.unitKind}`,
    `lift=${num(p.lift)}`,
    `drift=${num(p.drift)}`,
    `cohesion=${num(p.cohesion)}`,
    `branching=${num(p.branching)}`,
    `voidBias=${num(p.voidBias)}`,
    `unitRadius=${num(p.unitRadius)}`,
    `ringNodeCount=${num(p.ringNodeCount)}`,
    `ringTubeR=${num(p.ringTubeR)}`,
    `rootTarget=${num(p.rootTarget)}`,
    `target=${num(p.targetSurfaceCoverage)}`,
    `scale=${num(context.canonicalScaleMmPerUnit)}`,
    `variants=${context.variants.join("+")}`,
    `meshRes=${num(context.meshResolution)}`,
    `blendK=${num(context.blendK)}`,
  ].join("|");
}

/** True when a result grown under `started` may be accepted into `current`. */
export function isGenerationContextCurrent(started: GenerationContext, current: GenerationContext): boolean {
  return generationContextKey(started) === generationContextKey(current);
}

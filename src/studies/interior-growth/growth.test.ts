// ---------------------------------------------------------------------------
// S-interior-growth automated coverage. Plain-assertion script run via
// `npx tsx`, same convention as skin/partition.test.ts (AGENTS.md
// "重装備フレームワーク禁止" — no vitest/jest).
//
// Covers both Phase 0/1A (§13 of the original instruction) and Stage 1A.1
// author-feedback additions (§9 of docs/sonnet-instruction-20260724-katachi-
// interior-growth-author-feedback.md): printer presets, build-volume fit,
// angle-to-lateral derivation, primary-path search + branch invariance,
// height coverage, legacy recipe migration. "既存Katachi tests/build無退行"
// (§9 item 21) is verified separately via `npm run test:partition` / `npm
// run build`, not re-asserted here.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
// P2.3 correction: the "diagnosis-only" premise is CHECKED (P2.3-18 crawls the
// production import graph), which needs the filesystem — same shim-declared
// subset src/lib/studies.test.ts already uses.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname as pathDirname, join as pathJoin, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

// P2.3 diagnosis-only measurement module (see src/studies/interior-growth/ringFusionDiagnosis.ts).
import {
  BLEND_K_SWEEP_MULTIPLIERS,
  EDGE_CONTACT_CLASSES,
  HARD_UNION_BLEND_K,
  ELEMENT_ORDERS,
  UNIT_ORDERS,
  accountHardUnionFragmentation,
  boundsAroundComponent,
  buildHardUnionStageMesh,
  canonicalElements,
  classifyComponentHardOverlap,
  compareIsosurfaceClassification,
  compareStageComponentIdentity,
  compareSubsetSteps,
  componentSignatures,
  componentTriangles,
  createOrderedIndexedQuery,
  decomposeExactIndexedDifference,
  diagnoseCandidate,
  diagnosisFingerprint,
  foldExactUnionSdf,
  hardUnionSdf,
  matchComponentSets,
  measureAllEdges,
  measureBlendKSweep,
  measureCapsulePairGap,
  measureComponentHardOverlap,
  measureComponents,
  measureExactIndexedTopologyAttribution,
  measureFoldFidelity,
  measureOrderDependence,
  measureSignedVolumeConvention,
  measureSmoothOnlyRegion,
  measureSmoothVsHardOrdering,
  measureSubsetComponents,
  orderUnits,
  orderedElementList,
  partitionExactIndexedPopulations,
  productionEquivalentSubsetResolution,
  measureHardUnionMesh,
  diagnosisBounds,
} from "./ringFusionDiagnosis.ts";
// P25 sampling-density diagnosis (see src/studies/interior-growth/ringSamplingDiagnosis.ts).
import {
  DEFAULT_SAMPLING_ROW_OPTIONS,
  GRID_PHASES,
  MESHER_CUBE_OFFSETS,
  MESHER_TETS,
  cellPhaseOf,
  cellsAcrossTube,
  effectiveResolution,
  fieldStepOf,
  gridCountsOf,
  locateRingBreaks,
  materialClearanceFieldUnits,
  measureComponentIslands,
  measureSamplingRow,
  measureSyntheticRing,
  measureTubeScale,
  measureUnionConnectivity,
  phaseShiftedBounds,
  recordSamplingLattice,
  samplingRowFingerprint,
  syntheticRingPoints,
  tetIndexOf,
} from "./ringSamplingDiagnosis.ts";
import {
  DEFAULT_GROWTH_PARAMS,
  DEFAULT_PRINTER_PRESET_ID,
  PRINTER_PRESETS,
  computeDerivedLateralAllowance,
  findPrinterPreset,
  fitHostToBuildVolume,
  buildPlateOffset,
  hostBounds,
  hostSdf,
  isValidSupportAngle,
  vNorm,
  type FabricationEnvelope,
  type GrowthParams,
  type GrowthUnit,
  type GrowthUnitKind,
  type GrowthUnitPoint,
  type HostFixtureId,
} from "./field.ts";
import {
  analyzeVoids,
  computeAutoBudget,
  computeDerivedMaxUnsupportedSpanField,
  countActualPlateContacts,
  countUnreachableUnits,
  isOnPlateMm,
  lowestMaterialField,
  plateClearanceMm,
  createUnitsFieldSampler,
  isUnitOnPlate,
  unitPlateClearanceMm,
  evaluateCandidate,
  growNetwork,
  unitCentroid,
  unitsPointsSdf,
  O2_ALGORITHM_VERSION,
  type EvaluateInput,
  type GrowthResult,
  type GrowthVariant,
} from "./growth.ts";
import { createEmptyState, parseRecipe, record, replay, serializeRecipe, type HistoryEntry, type InteriorGrowthState } from "./history.ts";
import { generationContextKey, isGenerationContextCurrent, type GenerationContext } from "./generationContext.ts";
import { buildCandidateMesh, buildProvenance, countPlateContactVertices, deriveSavedFrame, evaluateSaveGate, meshLowestBuildAxisMm, plateBoundaryEpsilonMm, sha256Hex } from "./meshExport.ts";
import { buildMeshFromField, encodeBinaryStl, orientMeshForSavedStl, rescaleMeshResult, type Triangle } from "../cloud-sculpt/meshExport.ts";
import { sha256Hex as libSha256Hex } from "../../lib/hash.ts";
import {
  buildCoverageReferenceSamples,
  classifySample,
  isInsideUnitMaterial,
  computeProbeDepthField,
  computeReachableUnitIds,
  computeSurfaceCoverage,
  getCoverageReferenceMesh,
  type SurfaceSample,
} from "./coverage.ts";
import {
  assignRegionsToLaunchPoints,
  computeCandidateScore,
  computeSurfaceRegions,
  coneReachable,
  estimateRouteUnitCost,
  isSurfaceTraversable,
  localTangentBasis,
  projectOntoTangentPlane,
  SpatialHash,
  type ScoreTerms,
} from "./colonization.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function completeEnvelope(overrides: Partial<Omit<FabricationEnvelope, "derivedMaxLateralAdvancePerLayerMm">> = {}): FabricationEnvelope {
  const buildAxis = overrides.buildAxis ?? { x: 0, y: 1, z: 0 };
  const layerHeightMm = overrides.layerHeightMm ?? 0.2;
  const supportThresholdAngleDeg = overrides.supportThresholdAngleDeg ?? 30;
  return {
    buildAxis,
    layerHeightMm,
    supportThresholdAngleDeg,
    derivedMaxLateralAdvancePerLayerMm: computeDerivedLateralAllowance(layerHeightMm, supportThresholdAngleDeg),
  };
}

function baseParams(overrides: Partial<GrowthParams> = {}): GrowthParams {
  return { ...DEFAULT_GROWTH_PARAMS, seed: "test-seed", rootTarget: 3, ...overrides };
}

function scaleFor(hostId: HostFixtureId, buildAxis: FabricationEnvelope["buildAxis"] = { x: 0, y: 1, z: 0 }, presetId: "bambu-a1" | "bambu-a1-mini" = "bambu-a1-mini"): number {
  return fitHostToBuildVolume(hostId, buildAxis, findPrinterPreset(presetId).buildVolumeMm).scaleMmPerUnit;
}

function evalInputBase(overrides: Partial<EvaluateInput> & Pick<EvaluateInput, "hostId" | "isRoot" | "center">): EvaluateInput {
  const envelope = overrides.envelope ?? completeEnvelope();
  const buildAxis = overrides.buildAxis ?? envelope.buildAxis;
  return {
    hostId: overrides.hostId,
    buildAxis,
    plateOffset: overrides.plateOffset ?? hostBounds(overrides.hostId).min.y,
    canonicalScaleMmPerUnit: overrides.canonicalScaleMmPerUnit ?? 40,
    envelope,
    constraintsActive: overrides.constraintsActive ?? true,
    isRoot: overrides.isRoot,
    kind: overrides.kind ?? "coin",
    heading: overrides.heading ?? buildAxis,
    parentPoints: overrides.parentPoints ?? null,
    parentCentroid: overrides.parentCentroid ?? null,
    center: overrides.center,
    derivedMaxUnsupportedSpanField: overrides.derivedMaxUnsupportedSpanField ?? computeDerivedMaxUnsupportedSpanField(0.14),
  };
}

// === §9 items 1-4: printer / build-volume presets ===========================

test("Bambu Lab A1 preset build volume is 256x256x256mm, source=official", () => {
  const p = findPrinterPreset("bambu-a1");
  assert.deepEqual(p.buildVolumeMm, { x: 256, y: 256, z: 256 });
  assert.equal(p.source, "official");
});

test("Bambu Lab A1 mini preset build volume is 180x180x180mm, source=official", () => {
  const p = findPrinterPreset("bambu-a1-mini");
  assert.deepEqual(p.buildVolumeMm, { x: 180, y: 180, z: 180 });
  assert.equal(p.source, "official");
});

test("every non-custom preset's fitted host bbox never exceeds its own build volume, for all 3 hosts", () => {
  for (const preset of PRINTER_PRESETS) {
    if (preset.id === "custom") continue;
    for (const hostId of ["box", "sphere", "waisted"] as const) {
      const fit = fitHostToBuildVolume(hostId, { x: 0, y: 1, z: 0 }, preset.buildVolumeMm);
      assert.ok(fit.hostBboxMm.x <= preset.buildVolumeMm.x + 1e-6, `${hostId}/${preset.id} x`);
      assert.ok(fit.hostBboxMm.y <= preset.buildVolumeMm.y + 1e-6, `${hostId}/${preset.id} y`);
      assert.ok(fit.hostBboxMm.z <= preset.buildVolumeMm.z + 1e-6, `${hostId}/${preset.id} z`);
    }
  }
});

test("Custom preset accepts an author-provided build volume distinct from the official presets", () => {
  const custom = findPrinterPreset("custom");
  assert.equal(custom.source, "author");
  const fit = fitHostToBuildVolume("box", { x: 0, y: 1, z: 0 }, { x: 300, y: 150, z: 400 });
  assert.ok(fit.scaleMmPerUnit > 0);
  assert.ok(fit.hostBboxMm.y <= 150);
});

// === §9 items 5-7: angle -> derived lateral allowance ========================

test("support threshold angle 45deg makes derived lateral allowance equal layer height exactly", () => {
  const v = computeDerivedLateralAllowance(0.2, 45);
  assert.ok(Math.abs(v - 0.2) < 1e-9, `expected ~0.2, got ${v}`);
});

test("increasing the angle strictly decreases the derived lateral allowance", () => {
  const a = computeDerivedLateralAllowance(0.2, 20);
  const b = computeDerivedLateralAllowance(0.2, 60);
  assert.ok(b < a, `expected steeper angle -> smaller allowance, got ${a} -> ${b}`);
});

test("0deg, 90deg, and non-finite angles are rejected as invalid and derive to 0 (never NaN/Infinity)", () => {
  assert.equal(isValidSupportAngle(0), false);
  assert.equal(isValidSupportAngle(90), false);
  assert.equal(isValidSupportAngle(NaN), false);
  assert.equal(isValidSupportAngle(Infinity), false);
  assert.equal(isValidSupportAngle(-5), false);
  assert.equal(computeDerivedLateralAllowance(0.2, 0), 0);
  assert.equal(computeDerivedLateralAllowance(0.2, 90), 0);
  assert.equal(computeDerivedLateralAllowance(0.2, NaN), 0);
});

test("constrained generation throws when the envelope's angle is invalid (e.g. 90deg)", () => {
  const bad = completeEnvelope({ supportThresholdAngleDeg: 90 });
  assert.throws(() => growNetwork("box", bad, baseParams(), "coin-constrained", scaleFor("box")));
});

test("field-only generation does not require a valid angle (constraints are inactive)", () => {
  const bad = completeEnvelope({ supportThresholdAngleDeg: 90 });
  const result = growNetwork("box", bad, baseParams(), "field-only", scaleFor("box"));
  assert.equal(result.constraintsActive, false);
});

// === rule-level acceptance (unchanged rules, new EvaluateInput shape) =======

test("a root candidate off the build plate is rejected (root-not-on-plate)", () => {
  const input = evalInputBase({ hostId: "box", isRoot: true, center: { x: 0, y: 0.4, z: 0 } });
  const outcome = evaluateCandidate(input, [{ x: 0, y: 0.4, z: 0, r: 0.14 }]);
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.reason, "root-not-on-plate");
});

test("a candidate far outside the host is rejected as host-exterior", () => {
  const input = evalInputBase({ hostId: "sphere", isRoot: true, constraintsActive: false, center: { x: 10, y: 10, z: 10 } });
  const outcome = evaluateCandidate(input, [{ x: 10, y: 10, z: 10, r: 0.1 }]);
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.reason, "host-exterior");
});

test("a candidate that pokes slightly past the host surface is accepted and clip is recorded", () => {
  const b = hostBounds("sphere");
  const input = evalInputBase({ hostId: "sphere", isRoot: true, constraintsActive: false, plateOffset: b.min.y, center: { x: 0, y: b.max.y, z: 0 } });
  const outcome = evaluateCandidate(input, [{ x: 0, y: b.max.y, z: 0, r: 0.14 }]);
  assert.equal(outcome.accepted, true);
  assert.ok(outcome.clipFieldUnits >= 0);
});

test("a large lateral step relative to a small vertical rise is rejected (lateral-advance-exceeded)", () => {
  const envelope = completeEnvelope({ layerHeightMm: 0.2, supportThresholdAngleDeg: 80 }); // steep angle -> tiny lateral allowance
  const input = evalInputBase({
    hostId: "box",
    isRoot: false,
    envelope,
    canonicalScaleMmPerUnit: 40,
    heading: { x: 1, y: 0.05, z: 0 },
    parentPoints: [{ x: 0, y: 0, z: 0, r: 0.2 }],
    parentCentroid: { x: 0, y: 0, z: 0 },
    center: { x: 0.3, y: 0.02, z: 0 },
  });
  const outcome = evaluateCandidate(input, [{ x: 0.3, y: 0.02, z: 0, r: 0.14 }]);
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.reason, "lateral-advance-exceeded");
});

test("a candidate whose own lateral extent exceeds the derived unsupported-span limit is rejected", () => {
  const input = evalInputBase({
    hostId: "box",
    isRoot: false,
    canonicalScaleMmPerUnit: 40,
    parentPoints: [{ x: 0, y: 0, z: 0, r: 0.3 }],
    parentCentroid: { x: 0, y: 0, z: 0 },
    center: { x: 0, y: 0.1, z: 0 },
    derivedMaxUnsupportedSpanField: 0.05, // artificially tiny for this test
  });
  const points = [
    { x: 0, y: 0.1, z: 0, r: 0.1 },
    { x: 0.5, y: 0.1, z: 0, r: 0.1 },
    { x: -0.5, y: 0.1, z: 0, r: 0.1 },
  ];
  const outcome = evaluateCandidate(input, points);
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.reason, "unsupported-span-exceeded");
});

test("a ring whose axis is parallel to buildAxis (horizontal ring plane) is rejected by default", () => {
  const input = evalInputBase({
    hostId: "box",
    isRoot: false,
    kind: "ring",
    canonicalScaleMmPerUnit: 40,
    heading: { x: 0, y: 1, z: 0 },
    parentPoints: [{ x: 0, y: 0, z: 0, r: 0.3 }],
    parentCentroid: { x: 0, y: 0, z: 0 },
    center: { x: 0, y: 0.1, z: 0 },
    derivedMaxUnsupportedSpanField: 60, // generous, isolates the ring-horizontal check
  });
  const points = [
    { x: 0.1, y: 0.1, z: 0, r: 0.05 },
    { x: -0.1, y: 0.1, z: 0, r: 0.05 },
    { x: 0, y: 0.1, z: 0.1, r: 0.05 },
  ];
  const outcome = evaluateCandidate(input, points);
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.reason, "ring-horizontal");
});

// === void classification (unaffected by Stage 1A.1, kept as regression) ====

test("a deterministic 1-cell-thick shell fully encloses a closed void, correctly separated from exterior-connected void", () => {
  const resolution = 10;
  const b = hostBounds("box");
  const stepX = b.size.x / resolution;
  const stepY = b.size.y / resolution;
  const stepZ = b.size.z / resolution;
  const centerOf = (i: number, j: number, k: number) => ({
    x: b.min.x + (i + 0.5) * stepX,
    y: b.min.y + (j + 0.5) * stepY,
    z: b.min.z + (k + 0.5) * stepZ,
  });
  const shellPoints: { x: number; y: number; z: number; r: number }[] = [];
  for (let i = 2; i <= 7; i++) {
    for (let j = 2; j <= 7; j++) {
      for (let k = 2; k <= 7; k++) {
        const isInner = i >= 3 && i <= 6 && j >= 3 && j <= 6 && k >= 3 && k <= 6;
        if (isInner) continue;
        shellPoints.push({ ...centerOf(i, j, k), r: 0.02 });
      }
    }
  }
  const shellUnit: GrowthUnit = {
    id: 1,
    kind: "coin",
    points: shellPoints,
    parentId: null,
    generation: 0,
    supportContact: "build-plate",
    role: "root",
    heading: { x: 0, y: 1, z: 0 },
    verticalStepField: 0,
    lateralStepField: 0,
  };
  const voids = analyzeVoids("box", [shellUnit], 0.001, resolution);
  assert.equal(voids.closedVoidComponents, 1);
  assert.equal(voids.closedVoidCells, 4 * 4 * 4);
  assert.ok(voids.exteriorConnectedVoidCells > 0);
});

test("with zero units, every void cell in a convex host is exterior-connected", () => {
  const voids = analyzeVoids("box", [], 0.05, 12);
  assert.equal(voids.solidCells, 0);
  assert.equal(voids.closedVoidCells, 0);
  assert.equal(voids.closedVoidComponents, 0);
  assert.equal(voids.exteriorConnectedVoidCells, voids.hostInteriorCells);
});

// === §9 items 9-10: primary path parent validity / reachability ============

test("primary path units are all parent-connected, ending at a build-plate root", () => {
  const envelope = completeEnvelope();
  const params = baseParams();
  const result = growNetwork("box", envelope, params, "coin-constrained", scaleFor("box"));
  assert.ok(result.primaryPathUnitIds.length > 0, "expected a non-empty primary path");
  const byId = new Map(result.units.map((u) => [u.id, u]));
  for (let i = 1; i < result.primaryPathUnitIds.length; i++) {
    const u = byId.get(result.primaryPathUnitIds[i])!;
    assert.equal(u.parentId, result.primaryPathUnitIds[i - 1], `path unit ${i} must have the previous path unit as parent`);
  }
  const root = byId.get(result.primaryPathUnitIds[0])!;
  assert.equal(root.parentId, null);
  assert.equal(root.supportContact, "build-plate");
});

test("every unit (not just the primary path) is reachable from a build-plate root", () => {
  const envelope = completeEnvelope();
  const params = baseParams();
  const result = growNetwork("sphere", envelope, params, "coin-constrained", scaleFor("sphere"));
  assert.equal(countUnreachableUnits(result.units), 0);
});

// === §9 items 11-13: height coverage ========================================

test("box + A1 mini + default params: field-only/coin/ring all reach height coverage >= 0.95", () => {
  const envelope = completeEnvelope();
  const params: GrowthParams = { ...DEFAULT_GROWTH_PARAMS };
  const scale = scaleFor("box");
  for (const variant of ["field-only", "coin-constrained", "ring-constrained"] as GrowthVariant[]) {
    const result = growNetwork("box", envelope, params, variant, scale);
    assert.ok(result.heightCoverage >= 0.95, `${variant}: heightCoverage=${result.heightCoverage}, topReached=${result.topReached}`);
    assert.equal(result.topReached, true);
  }
});

test("sphere + A1 mini + default params: field-only/coin/ring all reach height coverage >= 0.95", () => {
  const envelope = completeEnvelope();
  const params: GrowthParams = { ...DEFAULT_GROWTH_PARAMS };
  const scale = scaleFor("sphere");
  for (const variant of ["field-only", "coin-constrained", "ring-constrained"] as GrowthVariant[]) {
    const result = growNetwork("sphere", envelope, params, variant, scale);
    assert.ok(result.heightCoverage >= 0.95, `${variant}: heightCoverage=${result.heightCoverage}, topReached=${result.topReached}`);
    assert.equal(result.topReached, true);
  }
});

test("waisted host: reach-or-not is deterministic and reproducible across repeated runs (top-not-reached is an honest, non-flaky outcome)", () => {
  const envelope = completeEnvelope();
  const params: GrowthParams = { ...DEFAULT_GROWTH_PARAMS };
  const scale = scaleFor("waisted");
  const a = growNetwork("waisted", envelope, params, "ring-constrained", scale);
  const b = growNetwork("waisted", envelope, params, "ring-constrained", scale);
  assert.equal(a.topReached, b.topReached);
  assert.equal(a.heightCoverage, b.heightCoverage);
  assert.deepEqual(a.primaryPathUnitIds, b.primaryPathUnitIds);
});

// === §9 item 14: seed determinism ===========================================

test("same seed+params+host+variant -> byte-identical result, including primaryPathUnitIds/heightCoverage/topReached", () => {
  const params = baseParams();
  const envelope = completeEnvelope();
  const a = growNetwork("box", envelope, params, "coin-constrained", scaleFor("box"));
  const b = growNetwork("box", envelope, params, "coin-constrained", scaleFor("box"));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.units.length > 0);
});

// === §9 item 15: branch invariance ==========================================

test("Phase B branching intensity never changes Phase A's own primary path / height coverage / top-reached", () => {
  const envelope = completeEnvelope();
  const scale = scaleFor("box");
  const low = growNetwork("box", envelope, baseParams({ branching: 0.05 }), "coin-constrained", scale);
  const high = growNetwork("box", envelope, baseParams({ branching: 0.95 }), "coin-constrained", scale);
  assert.deepEqual(low.primaryPathUnitIds, high.primaryPathUnitIds);
  assert.equal(low.heightCoverage, high.heightCoverage);
  assert.equal(low.topReached, high.topReached);
});

// === §9 item 16: auto budget never stops early ==============================

test("computeAutoBudget's total budget is strictly larger than its own minimum-path estimate (branch budget added on top, not replacing it)", () => {
  const budget = computeAutoBudget("box", { x: 0, y: 1, z: 0 }, 0.14);
  assert.ok(budget.totalBudget > budget.minimumPathUnits);
  assert.ok(budget.minimumPathUnits > 0);
});

test("maxUnits is no longer part of GrowthParams (author input removed, §5.3)", () => {
  assert.equal("maxUnits" in DEFAULT_GROWTH_PARAMS, false);
});

// === §9 item 17: legacy recipe migration ====================================

test("legacy Phase-1A recipe (nullable lateral/span envelope, setTargetLongestMm) migrates to the angle-based shape", () => {
  const legacyText = JSON.stringify({
    formatVersion: 1,
    studyId: "interior-growth",
    exportedAt: new Date().toISOString(),
    entries: [
      { t: 1, op: "setHost", args: { hostId: "box" } },
      { t: 2, op: "setEnvelope", args: { envelope: { buildAxis: { x: 0, y: 1, z: 0 }, layerHeightMm: 0.2, maxLateralAdvancePerLayerMm: 0.2, maxUnsupportedSpanMm: 6 } } },
      { t: 3, op: "setTargetLongestMm", args: { targetLongestMm: 80 } },
    ],
  });
  const { entries, legacyMigrated } = parseRecipe(legacyText);
  assert.equal(legacyMigrated, true);
  const state = replay(entries);
  assert.ok(isValidSupportAngle(state.envelope.supportThresholdAngleDeg));
  // layerHeightMm=0.2, maxLateralAdvancePerLayerMm=0.2 -> atan(1) = 45deg exactly.
  assert.ok(Math.abs(state.envelope.supportThresholdAngleDeg - 45) < 1e-6);
  assert.equal(state.printerPresetId, DEFAULT_PRINTER_PRESET_ID);
  assert.equal(state.hostId, "box");
});

test("S2.1 audit-fix C5: an S2-era stored generateCandidates result (has primaryPathUnitIds but no algorithmVersion) is detected as legacy and gets NULL-backfilled S2.1 fields, never fabricated as 0", () => {
  const s2EraResult = {
    ...growNetwork("box", completeEnvelope(), baseParams({ seed: "s2-era-fixture", targetSurfaceCoverage: 0.05 }), "coin-constrained", scaleFor("box")),
  } as Record<string, unknown>;
  // Strip exactly the S2.1-only fields an S2-era stored result would never have had, while KEEPING primaryPathUnitIds/heightCoverage/topReached/autoBudget (those already existed in S2) — this is what makes the old (wrong) "primaryPathUnitIds present -> already new" check silently let this through unmigrated.
  delete s2EraResult.algorithmVersion;
  delete s2EraResult.regionCount;
  delete s2EraResult.reachedRegionCount;
  delete s2EraResult.zeroGainAcceptedCount;
  delete s2EraResult.coverageCurve;
  delete s2EraResult.incrementalFinalDrift;
  delete s2EraResult.scoreWeights;
  const text = JSON.stringify({
    formatVersion: 1,
    studyId: "interior-growth",
    exportedAt: new Date().toISOString(),
    entries: [{ t: 1, op: "generateCandidates", args: { results: [s2EraResult] } }],
  });
  const { entries, legacyMigrated } = parseRecipe(text);
  assert.equal(legacyMigrated, true, "an S2-era result missing algorithmVersion must be detected as legacy, not silently passed through");
  const state = replay(entries);
  const migrated = state.results[0];
  assert.equal(migrated.algorithmVersion, "legacy-pre-s2.1");
  assert.equal(migrated.regionCount, null);
  assert.equal(migrated.reachedRegionCount, null);
  assert.equal(migrated.zeroGainAcceptedCount, null);
  assert.equal(migrated.coverageCurve, null);
  assert.equal(migrated.incrementalFinalDrift, null);
  assert.equal(migrated.scoreWeights, null);
  // What S2 already had must survive untouched, not re-fabricated as 0/false/empty.
  assert.ok(migrated.primaryPathUnitIds.length > 0);
  assert.equal(migrated.heightCoverage, s2EraResult.heightCoverage);
  assert.equal(migrated.topReached, s2EraResult.topReached);
});

test("a fresh S2.1 result's own algorithmVersion/scoreWeights round-trip through export -> import unchanged (not re-fabricated from the current global constant)", () => {
  const params = baseParams({ seed: "s21-roundtrip", targetSurfaceCoverage: 0.05 });
  const fresh = growNetwork("box", completeEnvelope(), params, "coin-constrained", scaleFor("box"));
  const text = JSON.stringify({
    formatVersion: 1,
    studyId: "interior-growth",
    exportedAt: new Date().toISOString(),
    entries: [{ t: 1, op: "generateCandidates", args: { results: [fresh] } }],
  });
  const { entries, legacyMigrated } = parseRecipe(text);
  assert.equal(legacyMigrated, false);
  const state = replay(entries);
  const roundTripped = state.results[0];
  assert.equal(roundTripped.algorithmVersion, O2_ALGORITHM_VERSION);
  assert.deepEqual(roundTripped.scoreWeights, fresh.scoreWeights);
  assert.deepEqual(roundTripped.coverageCurve, fresh.coverageCurve);
});

test("a recipe already in the new shape is left untouched (legacyMigrated=false)", () => {
  const envelope = completeEnvelope();
  const text = JSON.stringify({
    formatVersion: 1,
    studyId: "interior-growth",
    exportedAt: new Date().toISOString(),
    entries: [{ t: 1, op: "setEnvelope", args: { envelope } }],
  });
  const { legacyMigrated } = parseRecipe(text);
  assert.equal(legacyMigrated, false);
});

// === §9 item 18: recipe round-trip ==========================================

test("recipe export -> import -> replay reproduces the same state", () => {
  let history: HistoryEntry[] = [];
  let state: InteriorGrowthState = createEmptyState();
  record(history, state, "setHost", { hostId: "sphere" });
  const envelope = completeEnvelope();
  record(history, state, "setEnvelope", { envelope });
  const params = baseParams();
  record(history, state, "setParams", { params });
  const result = growNetwork(state.hostId, state.envelope, state.params, "coin-constrained", scaleFor("sphere"));
  record(history, state, "generateCandidates", { results: [result] });

  const text = serializeRecipe(history);
  const { entries, legacyMigrated } = parseRecipe(text);
  assert.equal(legacyMigrated, false);
  const replayed = replay(entries);

  assert.equal(replayed.hostId, state.hostId);
  assert.deepEqual(replayed.envelope, state.envelope);
  assert.deepEqual(replayed.params, state.params);
  assert.equal(JSON.stringify(replayed.results), JSON.stringify(state.results));
});

// === §9 item 19: STL bbox within build volume ===============================

test("a generated candidate's saved STL mm bbox fits within the printer's build volume", () => {
  const preset = findPrinterPreset("bambu-a1-mini");
  const envelope = completeEnvelope();
  const params: GrowthParams = { ...DEFAULT_GROWTH_PARAMS };
  const fit = fitHostToBuildVolume("box", envelope.buildAxis, preset.buildVolumeMm);
  const result = growNetwork("box", envelope, params, "coin-constrained", fit.scaleMmPerUnit);
  assert.ok(result.units.length > 0);
  const mesh = buildCandidateMesh(result, 40, params.unitRadius * 0.3);
  assert.ok(mesh.mmBounds.size.x <= preset.buildVolumeMm.x);
  assert.ok(mesh.mmBounds.size.y <= preset.buildVolumeMm.y);
  assert.ok(mesh.mmBounds.size.z <= preset.buildVolumeMm.z);
});

test("evaluateSaveGate fails a mesh whose mm bbox exceeds a (deliberately tiny) build volume", () => {
  const preset = findPrinterPreset("bambu-a1-mini");
  const envelope = completeEnvelope();
  const params: GrowthParams = { ...DEFAULT_GROWTH_PARAMS };
  const fit = fitHostToBuildVolume("box", envelope.buildAxis, preset.buildVolumeMm);
  const result = growNetwork("box", envelope, params, "coin-constrained", fit.scaleMmPerUnit);
  const mesh = buildCandidateMesh(result, 40, params.unitRadius * 0.3);
  const gate = evaluateSaveGate(mesh, { x: 1, y: 1, z: 1 }, envelope.layerHeightMm);
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.some((r) => r.includes("build volume")));
});

// === §9 item 20: saved-topology gate =========================================

test("a well-connected coin-constrained candidate's mesh passes the saved-topology gate", () => {
  const preset = findPrinterPreset("bambu-a1-mini");
  const envelope = completeEnvelope();
  // The SHIPPED default unitRadius, deliberately. This fixture used to pass
  // 0.18, from a round when growth barely reached the host boundary. Now that
  // it does reach it, a 0.18 unit's own material extends ~11mm past the host
  // on each side while fitHostToBuildVolume only reserves 9mm, so the mesh
  // genuinely exceeds the A1 mini build volume (measured 184.2mm vs 180mm on
  // box) and the gate correctly refuses it. That is a real finding about the
  // margin, recorded in the README, not a topology failure — the same mesh has
  // 1 component and zero open/non-manifold/degenerate edges.
  //
  // Resolution 64 — the value main.ts actually exports at (MESH_RESOLUTION) —
  // not 40. Measured attribution for that change: this fixture inherits the
  // default targetSurfaceCoverage of 0.5, which grows ~900 units, and at
  // resolution 40 the marching-tetrahedra grid is too coarse to resolve that
  // density: the SAME candidate meshes as 2 components at 40 and 1 at 64, both
  // with and without the build-plate clip (so the clip is not the cause). A
  // fixture asserting the export gate should use the export resolution.
  const params = baseParams({ unitRadius: DEFAULT_GROWTH_PARAMS.unitRadius, rootTarget: 2 });
  const fit = fitHostToBuildVolume("box", envelope.buildAxis, preset.buildVolumeMm);
  const result = growNetwork("box", envelope, params, "coin-constrained", fit.scaleMmPerUnit);
  assert.ok(result.units.length > 0);
  const mesh = buildCandidateMesh(result, 64, params.unitRadius * 0.3);
  const gate = evaluateSaveGate(mesh, preset.buildVolumeMm, envelope.layerHeightMm);
  assert.equal(gate.ok, true, `expected a passing gate, got: ${gate.reasons.join(" / ")}`);
  assert.equal(gate.topology.openEdges, 0);
  assert.equal(gate.topology.nonManifoldEdges, 0);
  assert.equal(gate.topology.degenerateTriangleCount, 0);
});

test("buildCandidateMesh refuses to build from zero accepted units", () => {
  const params = baseParams({ rootTarget: 0 });
  const empty: GrowthResult = growNetwork("box", completeEnvelope({ supportThresholdAngleDeg: 90 }), params, "field-only", scaleFor("box"));
  // (angle=90 is only invalid for CONSTRAINED variants; field-only ignores it, so force zero units via rootTarget instead)
  if (empty.units.length > 0) {
    assert.ok(true); // fixture produced units unexpectedly; skip strict zero-unit assertion, still exercise the guard below on a manually-emptied result
  }
  const trulyEmpty: GrowthResult = { ...empty, units: [] };
  assert.throws(() => buildCandidateMesh(trulyEmpty, 20, 0.05));
});

// === SHA-256 ==================================================================

await testAsync("sha256Hex is deterministic and 64 hex chars", async () => {
  const bytes = new TextEncoder().encode("interior-growth-test").buffer;
  const a = await sha256Hex(bytes as ArrayBuffer);
  const b = await sha256Hex(bytes as ArrayBuffer);
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.match(a, /^[0-9a-f]{64}$/);
});

// === input immutability ======================================================

test("growNetwork never mutates the envelope or params objects passed in", () => {
  const envelope = completeEnvelope();
  const params = baseParams();
  const envelopeBefore = JSON.stringify(envelope);
  const paramsBefore = JSON.stringify(params);
  growNetwork("waisted", envelope, params, "ring-constrained", scaleFor("waisted"));
  assert.equal(JSON.stringify(envelope), envelopeBefore);
  assert.equal(JSON.stringify(params), paramsBefore);
});

test("growNetwork's returned params/envelope are independent snapshots", () => {
  const envelope = completeEnvelope();
  const params = baseParams();
  const result = growNetwork("waisted", envelope, params, "ring-constrained", scaleFor("waisted"));
  envelope.layerHeightMm = 999;
  (params as { seed: string }).seed = "mutated-after-the-fact";
  assert.notEqual(result.envelope.layerHeightMm, 999);
  assert.notEqual(result.params.seed, "mutated-after-the-fact");
});

// === surface coverage (S1 — Optimizer/docs/katachi-interior-growth-surface- ===
// === coverage-plan-20260725.md §8 items 1-6, measurement only ===============

function syntheticUnit(overrides: Partial<GrowthUnit> & Pick<GrowthUnit, "id" | "kind" | "points">): GrowthUnit {
  return {
    parentId: null,
    generation: 0,
    supportContact: "build-plate",
    role: "root",
    heading: { x: 0, y: 1, z: 0 },
    verticalStepField: 0,
    lateralStepField: 0,
    ...overrides,
  };
}

test("coverage reference samples are identical across two builds with the same host/resolution/count/seed", () => {
  const a = buildCoverageReferenceSamples("box", 20, 500, "coverage-test-seed");
  const b = buildCoverageReferenceSamples("box", 20, 500, "coverage-test-seed");
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("coverage reference sample weights sum to the reference mesh's own total surface area", () => {
  const samples = buildCoverageReferenceSamples("box", 24, 800, "coverage-test-seed");
  const totalWeight = samples.reduce((sum, s) => sum + s.areaWeight, 0);
  // Independently recompute the same reference mesh's total area via its own triangles, so this doesn't just re-check the areaWeight formula against itself.
  const bounds = hostBounds("box");
  const margin = Math.max(0.05, bounds.longest * 0.03);
  const padded = {
    min: { x: bounds.min.x - margin, y: bounds.min.y - margin, z: bounds.min.z - margin },
    max: { x: bounds.max.x + margin, y: bounds.max.y + margin, z: bounds.max.z + margin },
    size: { x: bounds.size.x + 2 * margin, y: bounds.size.y + 2 * margin, z: bounds.size.z + 2 * margin },
    longest: bounds.longest + 2 * margin,
  };
  const mesh = buildMeshFromField(padded, (x: number, y: number, z: number) => hostSdf("box", x, y, z), { resolution: 24, targetLongestMm: 1 });
  let independentTotalArea = 0;
  for (const tri of mesh.triangles) {
    const ab = { x: tri.b.x - tri.a.x, y: tri.b.y - tri.a.y, z: tri.b.z - tri.a.z };
    const ac = { x: tri.c.x - tri.a.x, y: tri.c.y - tri.a.y, z: tri.c.z - tri.a.z };
    const cross = { x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x };
    independentTotalArea += Math.hypot(cross.x, cross.y, cross.z) / 2;
  }
  assert.ok(Math.abs(totalWeight - independentTotalArea) / independentTotalArea < 0.02, `totalWeight=${totalWeight} vs independentTotalArea=${independentTotalArea}`);
});

test("empty unit set -> measured coverage is exactly 0, every sample is no-material", () => {
  const samples = buildCoverageReferenceSamples("sphere", 20, 300, "coverage-test-seed");
  const result = computeSurfaceCoverage(samples, [], computeProbeDepthField(0.14));
  assert.equal(result.measuredCoverage, 0);
  assert.equal(result.coveredSampleCount, 0);
  assert.equal(result.noMaterialSampleCount, result.sampleCount);
});

test("a single oversized reachable fixture unit covering the whole host -> measured coverage is approximately 1", () => {
  const samples = buildCoverageReferenceSamples("sphere", 20, 300, "coverage-test-seed");
  const hb2 = hostBounds("sphere");
  const center = { x: (hb2.min.x + hb2.max.x) / 2, y: (hb2.min.y + hb2.max.y) / 2, z: (hb2.min.z + hb2.max.z) / 2 };
  const giant = syntheticUnit({ id: 1, kind: "coin", points: [{ ...center, r: hb2.longest * 5 }] });
  const result = computeSurfaceCoverage(samples, [giant], computeProbeDepthField(0.14));
  assert.ok(result.measuredCoverage > 0.999, `measuredCoverage=${result.measuredCoverage}`);
});

test("a ring's own hole center is not covered even though the tube material around it is", () => {
  const nodeCount = 4;
  const R = 1;
  const tubeR = 0.2;
  const points = Array.from({ length: nodeCount }, (_, i) => {
    const angle = (i / nodeCount) * Math.PI * 2;
    return { x: Math.cos(angle) * R, y: Math.sin(angle) * R, z: 0, r: tubeR };
  });
  const ring = syntheticUnit({ id: 1, kind: "ring", points });
  const reachableIds = computeReachableUnitIds([ring]);
  const probeDepthField = 0;

  const holeCenter: SurfaceSample = { id: 1, point: { x: 0, y: 0, z: 0 }, inwardNormal: { x: 0, y: 0, z: 0 }, areaWeight: 1 };
  const holeClassified = classifySample(holeCenter, [ring], reachableIds, probeDepthField);
  assert.equal(holeClassified.status, "no-material", "ring hole center must not be covered by ring material");

  const onNode: SurfaceSample = { id: 2, point: { x: R, y: 0, z: 0 }, inwardNormal: { x: 0, y: 0, z: 0 }, areaWeight: 1 };
  assert.equal(classifySample(onNode, [ring], reachableIds, probeDepthField).status, "covered");

  // Midpoint between two adjacent nodes: outside either node's OWN raw sphere (a raw-sphere-union test would wrongly call this uncovered), but on the tube's tapered-capsule surface between them.
  const midpoint: SurfaceSample = {
    id: 3,
    point: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2, z: 0 },
    inwardNormal: { x: 0, y: 0, z: 0 },
    areaWeight: 1,
  };
  const distFromNode0 = Math.hypot(midpoint.point.x - points[0].x, midpoint.point.y - points[0].y);
  assert.ok(distFromNode0 > tubeR, "test setup check: midpoint must be outside node0's own raw sphere");
  assert.equal(classifySample(midpoint, [ring], reachableIds, probeDepthField).status, "covered", "tube material between adjacent ring nodes must be covered even though no single node's raw sphere reaches it");
});

test("a covered unit that cannot reach a build-plate root is reported unreachable, not covered, and excluded from the coverage ratio", () => {
  const orphan = syntheticUnit({ id: 1, kind: "coin", points: [{ x: 0, y: 0, z: 0, r: 0.5 }], parentId: null, supportContact: "parent" });
  const reachableIds = computeReachableUnitIds([orphan]);
  assert.equal(reachableIds.size, 0);
  const sample: SurfaceSample = { id: 1, point: { x: 0, y: 0, z: 0 }, inwardNormal: { x: 0, y: 0, z: 0 }, areaWeight: 1 };
  const classified = classifySample(sample, [orphan], reachableIds, 0);
  assert.equal(classified.status, "unreachable");
  const result = computeSurfaceCoverage([sample], [orphan], 0);
  assert.equal(result.measuredCoverage, 0);
  assert.equal(result.unreachableSampleCount, 1);
});

test("a probe covered by both an unreachable unit and a separate reachable unit is reported covered (regression: must not stop at the first array-order hit)", () => {
  const unreachable = syntheticUnit({ id: 1, kind: "coin", points: [{ x: 0, y: 0, z: 0, r: 0.5 }], parentId: null, supportContact: "parent" });
  const reachable = syntheticUnit({ id: 2, kind: "coin", points: [{ x: 0, y: 0, z: 0, r: 0.5 }], parentId: null, supportContact: "build-plate" });
  const units = [unreachable, reachable]; // unreachable listed FIRST — the bug this regresses against returned on the first array-order hit regardless of reachability
  const reachableIds = computeReachableUnitIds(units);
  const sample: SurfaceSample = { id: 1, point: { x: 0, y: 0, z: 0 }, inwardNormal: { x: 0, y: 0, z: 0 }, areaWeight: 1 };
  assert.equal(classifySample(sample, units, reachableIds, 0).status, "covered");
});

// === S2: coverage-directed growth behavior (surface-coverage plan §8 items ===
// === 7-13) ====================================================================

test("increasing targetSurfaceCoverage never DECREASES measured coverage (monotonic, same seed/host/variant)", () => {
  const targets = [0.05, 0.15, 0.25];
  let previous = -1;
  for (const t of targets) {
    const params = baseParams({ targetSurfaceCoverage: t, seed: "s2-monotonic" });
    const result = growNetwork("box", completeEnvelope(), params, "field-only", scaleFor("box"));
    assert.ok(result.measuredSurfaceCoverage >= previous - 1e-9, `target=${t}: measuredCoverage ${result.measuredSurfaceCoverage} regressed below previous ${previous}`);
    previous = result.measuredSurfaceCoverage;
  }
});

test("an easily-reachable target is actually reached, within tolerance, with stopReason=target-reached", () => {
  const params = baseParams({ targetSurfaceCoverage: 0.03, seed: "s2-reachable" });
  const result = growNetwork("box", completeEnvelope(), params, "coin-constrained", scaleFor("box"));
  assert.equal(result.coverageStopReason, "target-reached");
  assert.ok(result.measuredSurfaceCoverage >= 0.03 - 0.02 - 1e-9, `measuredCoverage=${result.measuredSurfaceCoverage} did not reach target-2%tolerance`);
});

test("same seed+params+host+variant -> byte-identical S2 result (units/edges/measuredCoverage/stopReason)", () => {
  const params = baseParams({ targetSurfaceCoverage: 0.1, seed: "s2-determinism" });
  const envelope = completeEnvelope();
  const a = growNetwork("box", envelope, params, "coin-constrained", scaleFor("box"));
  const b = growNetwork("box", envelope, params, "coin-constrained", scaleFor("box"));
  assert.equal(JSON.stringify(a.units), JSON.stringify(b.units));
  assert.equal(JSON.stringify(a.edges), JSON.stringify(b.edges));
  assert.equal(a.measuredSurfaceCoverage, b.measuredSurfaceCoverage);
  assert.equal(a.coverageStopReason, b.coverageStopReason);
});

test("Phase A's own primary path / height coverage / top-reached are identical regardless of how much Phase B/C colonization runs", () => {
  const envelope = completeEnvelope();
  const low = growNetwork("box", envelope, baseParams({ targetSurfaceCoverage: 0.01, seed: "s2-invariance" }), "coin-constrained", scaleFor("box"));
  const high = growNetwork("box", envelope, baseParams({ targetSurfaceCoverage: 0.2, seed: "s2-invariance" }), "coin-constrained", scaleFor("box"));
  assert.ok(high.units.length > low.units.length, "test setup check: the higher target should actually cause more colonization");
  assert.deepEqual(high.primaryPathUnitIds, low.primaryPathUnitIds);
  assert.equal(high.heightCoverage, low.heightCoverage);
  assert.equal(high.topReached, low.topReached);
});

test("every unit is still reachable from a build-plate root after coverage-directed colonization", () => {
  const params = baseParams({ targetSurfaceCoverage: 0.15, seed: "s2-reachability" });
  const result = growNetwork("box", completeEnvelope(), params, "ring-constrained", scaleFor("box"));
  assert.ok(result.units.length > result.primaryPathUnitIds.length, "test setup check: colonization should have added units beyond the primary path");
  assert.equal(countUnreachableUnits(result.units), 0);
});

test("an angle too strict for a ring to ever tilt (below the ring-horizontal floor) honestly fails to reach a real target, never fakes target-reached", () => {
  const envelope = completeEnvelope({ supportThresholdAngleDeg: 15 }); // below MIN_RING_TILT_RAD's ~20deg floor - no valid ring tilt exists
  const params = baseParams({ targetSurfaceCoverage: 0.3, seed: "s2-strict-angle" });
  const result = growNetwork("waisted", envelope, params, "ring-constrained", scaleFor("waisted", envelope.buildAxis));
  assert.notEqual(result.coverageStopReason, "target-reached");
  assert.ok(result.measuredSurfaceCoverage < 0.3 - 0.02, `measuredCoverage=${result.measuredSurfaceCoverage} should have stayed well short of the 30% target`);
});

test("a plateaued/budget-exhausted run never reports its actual gap as if the target had been met", () => {
  // Default target (50%) is known (see growth.ts's own S2 header comment) to
  // stay far out of reach for constrained variants under this Study's
  // simplified greedy colonization — exactly the honest-non-success case
  // §10 requires never be silently reported as success.
  const params = baseParams({ targetSurfaceCoverage: 0.5, seed: "s2-honest-gap" });
  const result = growNetwork("box", completeEnvelope(), params, "coin-constrained", scaleFor("box"));
  assert.notEqual(result.coverageStopReason, "target-reached");
  assert.ok(result.measuredSurfaceCoverage < 0.5 - 0.02);
});

// === S2.1: coverage attainment planner (surface-coverage-plan §8 items 1-9, ===
// === 14, 15, 19 — see final report for which of the 20 listed items this   ===
// === session did NOT get to: 4 (literal frontier PQ — this design uses a  ===
// === deterministic region-priority scan instead, tested for determinism   ===
// === here, not FIFO/heap ordering), 10-13 (target/monotonic/honesty —     ===
// === already covered by the S2-round tests above, unchanged), 16-18       ===
// === (recipe/provenance/legacy-migration wiring — not yet done, see       ===
// === README Next), 20 (npm run test:partition, run separately) ===========

test("SpatialHash.queryRadius matches a brute-force scan (item 2)", () => {
  const rng2 = (() => {
    let s = 12345;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  })();
  const pts: { x: number; y: number; z: number; id: number }[] = [];
  for (let i = 0; i < 200; i++) pts.push({ x: rng2() * 10 - 5, y: rng2() * 10 - 5, z: rng2() * 10 - 5, id: i });
  const hash = new SpatialHash<{ x: number; y: number; z: number; id: number }>(1.3);
  for (const p of pts) hash.insert(p, p);
  for (const probe of [{ x: 0, y: 0, z: 0 }, { x: 3, y: -2, z: 1 }, { x: -4, y: 4, z: -4 }]) {
    for (const radius of [0.5, 2, 4]) {
      const viaHash = new Set(hash.queryRadius(probe, radius).map((p) => p.id));
      const viaBruteForce = new Set(pts.filter((p) => Math.hypot(p.x - probe.x, p.y - probe.y, p.z - probe.z) <= radius).map((p) => p.id));
      assert.deepEqual(viaHash, viaBruteForce, `probe=${JSON.stringify(probe)} radius=${radius}`);
    }
  }
});

test("incremental coverage tracking matches a fresh canonical recompute within a tiny drift bound (item 1)", () => {
  const fit = scaleFor("box");
  const params = baseParams({ targetSurfaceCoverage: 0.15, seed: "s21-drift" });
  const result = growNetwork("box", completeEnvelope(), params, "coin-constrained", fit);
  assert.ok(result.incrementalFinalDrift !== null && result.incrementalFinalDrift < 1e-6, `incrementalFinalDrift=${result.incrementalFinalDrift} should be ~0 (canonical recompute is always the returned value)`);
});

test("computeSurfaceRegions assigns identical region ids for the same host/reference conditions (item 3)", () => {
  const samples = getCoverageReferenceMesh("box");
  const a = computeSurfaceRegions(samples, hostBounds("box"), { x: 0, y: 1, z: 0 });
  const b = computeSurfaceRegions(samples, hostBounds("box"), { x: 0, y: 1, z: 0 });
  const aIds = [...a.regionOf.entries()].sort((x, y) => x[0] - y[0]);
  const bIds = [...b.regionOf.entries()].sort((x, y) => x[0] - y[0]);
  assert.deepEqual(aIds, bIds);
  assert.equal(a.regions.size, b.regions.size);
});

test("coneReachable's single-step boundary matches allowedLateralForStepMm exactly (item 8 substitute — the C2 audit-fix's shared helper, not a reimplemented formula) at several angles/margins", () => {
  // stepLengthField huge -> route-integration collapses to exactly ONE
  // step, and layerHeightMm=1/verticalRise=10 keeps that one step's own
  // rise at 10 full layers (well above 1), so allowedLateralForStepMm's own
  // per-step floor never distorts the result relative to the plain
  // verticalRise/tan(angle) formula rule 5 itself uses.
  const layerHeightMm = 1;
  const canonicalScaleMmPerUnit = 1;
  const hugeStepLength = 1e6;
  for (const angleDeg of [10, 20, 30, 45, 60, 80]) {
    const derivedMaxLateralAdvancePerLayerMm = computeDerivedLateralAllowance(layerHeightMm, angleDeg);
    const verticalRise = 10;
    const maxLateral = verticalRise / Math.tan((angleDeg * Math.PI) / 180);
    const from = { x: 0, y: 0, z: 0 };
    const buildAxis = { x: 0, y: 1, z: 0 };
    const justInside = coneReachable(from, { x: maxLateral * 0.99, y: verticalRise, z: 0 }, buildAxis, layerHeightMm, derivedMaxLateralAdvancePerLayerMm, canonicalScaleMmPerUnit, hugeStepLength);
    const justOutside = coneReachable(from, { x: maxLateral * 1.05, y: verticalRise, z: 0 }, buildAxis, layerHeightMm, derivedMaxLateralAdvancePerLayerMm, canonicalScaleMmPerUnit, hugeStepLength);
    assert.ok(justInside.feasible, `angle=${angleDeg}: a target just inside the single-step cone should be feasible`);
    assert.ok(!justOutside.feasible, `angle=${angleDeg}: a target just outside the single-step cone should be infeasible`);
  }
});

test("coneReachable's multi-step route integration is at least as permissive as the naive continuous formula (audit §4.1's per-step floor finding — many small steps each get >=1 layer's worth of lateral)", () => {
  // A small step count means the per-step vertical rise is TINY relative to
  // layerHeightMm, so allowedLateralForStepMm's own max(1, ...) floor grants
  // each step a full layer's lateral budget despite that tiny rise —
  // summed over many steps, the route can reach further laterally than
  // verticalRise/tan(angle) alone would suggest.
  const layerHeightMm = 1;
  const angleDeg = 45; // tan(45)=1, so the naive continuous formula's maxLateral == verticalRise exactly
  const derivedMaxLateralAdvancePerLayerMm = computeDerivedLateralAllowance(layerHeightMm, angleDeg);
  const canonicalScaleMmPerUnit = 1;
  const verticalRise = 1; // 1 field unit == 1mm rise total, spread over MANY small steps below
  const naiveMaxLateral = verticalRise / Math.tan((angleDeg * Math.PI) / 180); // = 1
  const from = { x: 0, y: 0, z: 0 };
  const buildAxis = { x: 0, y: 1, z: 0 };
  const tinyStepLength = verticalRise / 50; // forces ~50 steps
  const beyondNaiveButRouteFeasible = coneReachable(from, { x: naiveMaxLateral * 3, y: verticalRise, z: 0 }, buildAxis, layerHeightMm, derivedMaxLateralAdvancePerLayerMm, canonicalScaleMmPerUnit, tinyStepLength);
  assert.ok(beyondNaiveButRouteFeasible.feasible, "a route built from many small steps should reach further laterally than the naive single continuous formula predicts");
});

test("coneReachable treats a target at or below the frontier's height as feasible only when there is essentially no lateral travel needed", () => {
  const from = { x: 0, y: 5, z: 0 };
  const buildAxis = { x: 0, y: 1, z: 0 };
  const layerHeightMm = 0.2;
  const derivedMaxLateralAdvancePerLayerMm = computeDerivedLateralAllowance(layerHeightMm, 30);
  const canonicalScaleMmPerUnit = 1;
  const stepLength = 0.1;
  // Below the frontier's height WITH real lateral distance: rule 5's flat/
  // negative-rise branch only allows a tiny lateral advance, capped at the
  // per-layer allowance itself, not a route-integrated one — verify the
  // exact boundary rather than a vacuous "false || true" placeholder (C6
  // audit-fix: that pattern always passes and was flagged for removal).
  const belowWithLateral = coneReachable(from, { x: 0.5, y: 4, z: 0 }, buildAxis, layerHeightMm, derivedMaxLateralAdvancePerLayerMm, canonicalScaleMmPerUnit, stepLength);
  assert.equal(belowWithLateral.feasible, false, "a target below the frontier that ALSO needs real lateral travel (negative rise) must be infeasible");
  const directlyBelowSameSpot = coneReachable(from, { x: 0, y: 4, z: 0 }, buildAxis, layerHeightMm, derivedMaxLateralAdvancePerLayerMm, canonicalScaleMmPerUnit, stepLength);
  assert.equal(directlyBelowSameSpot.feasible, true, "a target directly below with ZERO lateral distance needs no lateral travel at all, so it is trivially feasible");
  assert.ok(coneReachable(from, { x: 1e-9, y: 5, z: 0 }, buildAxis, layerHeightMm, derivedMaxLateralAdvancePerLayerMm, canonicalScaleMmPerUnit, stepLength).feasible);
  assert.ok(!coneReachable(from, { x: 0.5, y: 5, z: 0 }, buildAxis, layerHeightMm, derivedMaxLateralAdvancePerLayerMm, canonicalScaleMmPerUnit, stepLength).feasible);
});

test("computeCandidateScore prefers a candidate with more coverage gain, all else equal (item 5)", () => {
  const base: ScoreTerms = {
    normalizedCoverageGain: 0,
    normalizedAddedMaterial: 0.3,
    normalizedConstraintMarginRisk: 0.3,
    normalizedCoveredOverlap: 0.1,
    normalizedAddedPathLength: 1,
    normalizedHostBoundaryRisk: 0.1,
  };
  const lowGain = computeCandidateScore({ ...base, normalizedCoverageGain: 0.01 });
  const highGain = computeCandidateScore({ ...base, normalizedCoverageGain: 0.2 });
  assert.ok(highGain > lowGain, "more coverage gain must score strictly higher when every other term is identical");
});

test("computeCandidateScore penalizes higher overlap/material-cost/boundary-risk, all else equal", () => {
  const base: ScoreTerms = {
    normalizedCoverageGain: 0.1,
    normalizedAddedMaterial: 0.2,
    normalizedConstraintMarginRisk: 0.2,
    normalizedCoveredOverlap: 0.1,
    normalizedAddedPathLength: 1,
    normalizedHostBoundaryRisk: 0.1,
  };
  const worseOverlap = computeCandidateScore({ ...base, normalizedCoveredOverlap: 0.9 });
  const worseMaterial = computeCandidateScore({ ...base, normalizedAddedMaterial: 0.9 });
  const worseBoundary = computeCandidateScore({ ...base, normalizedHostBoundaryRisk: 0.9 });
  const baseline = computeCandidateScore(base);
  assert.ok(worseOverlap < baseline);
  assert.ok(worseMaterial < baseline);
  assert.ok(worseBoundary < baseline);
});

test("S2.1 coin-constrained growth: target-region selection order is deterministic across repeated runs with the same seed (item 4 substitute — this design has no literal priority-queue class, see file header)", () => {
  const fit = scaleFor("box");
  const params = baseParams({ targetSurfaceCoverage: 0.1, seed: "s21-determinism" });
  const a = growNetwork("box", completeEnvelope(), params, "coin-constrained", fit);
  const b = growNetwork("box", completeEnvelope(), params, "coin-constrained", fit);
  assert.equal(JSON.stringify(a.units), JSON.stringify(b.units));
  assert.deepEqual(a.coverageCurve, b.coverageCurve);
  assert.equal(a.reachedRegionCount, b.reachedRegionCount);
  assert.equal(a.zeroGainAcceptedCount, b.zeroGainAcceptedCount);
});

test("S2.1 audit-fix C1: default rootTarget (historically the exact value that produced a 3-4 component STL) now yields exactly 1 graph root and 1 mesh component, box/sphere/waisted, coin-constrained (item 9, C6: matrix kept at default conditions, not weakened to rootTarget:1)", () => {
  // DEFAULT_GROWTH_PARAMS.rootTarget is used un-overridden here on purpose
  // — the independent audit's own repro used the default (5) and found 3-4
  // components. rootTarget is now a documented no-op (see field.ts), so
  // this must hold at its default value, not just at an artificially
  // weakened rootTarget:1.
  for (const host of ["box", "sphere", "waisted"] as const) {
    const params = baseParams({ targetSurfaceCoverage: 0.12, seed: `s21-connectivity-${host}`, rootTarget: DEFAULT_GROWTH_PARAMS.rootTarget });
    const fit = scaleFor(host);
    const result = growNetwork(host, completeEnvelope(), params, "coin-constrained", fit);
    // rootCount can legitimately be 0 (Phase A's own rejection-sampling root
    // search can fail for a given seed, especially on curved hosts — a
    // pre-existing, honest, documented possibility, not something S2.1
    // promises to fix) but must NEVER exceed 1 — that was the actual bug.
    assert.ok(result.rootCount <= 1, `${host}: graph root count must never exceed 1, got ${result.rootCount}`);
    if (result.rootCount === 0) continue; // nothing to grow or check connectivity of this seed
    assert.ok(result.units.length > result.primaryPathUnitIds.length, `${host}: test setup check — S2.1 should have added units beyond the primary path`);
    const mesh = buildCandidateMesh(result, 24, params.unitRadius * 0.3);
    const gate = evaluateSaveGate(mesh, { x: 1000, y: 1000, z: 1000 }, result.envelope.layerHeightMm);
    assert.equal(gate.topology.connectedComponents, 1, `${host}: expected a single connected component, got ${gate.topology.connectedComponents}`);
    assert.ok(gate.ok, `${host}: save gate should pass: ${gate.reasons.join(" / ")}`);
  }
});

test("S2.1 audit-fix C1: a synthetic disconnected mesh fails the save gate (item C1's own required regression — the OLD gate only checked watertightness, not component count)", () => {
  // Two separate closed cubes, far apart — a minimal synthetic fixture for
  // "clearly two components", independent of growth output.
  const cubeTriangles = (offset: { x: number; y: number; z: number }): { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number }; c: { x: number; y: number; z: number } }[] => {
    const s = 1;
    const v = (dx: number, dy: number, dz: number) => ({ x: offset.x + dx * s, y: offset.y + dy * s, z: offset.z + dz * s });
    const p = [v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0), v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)];
    const quad = (i: number, j: number, k: number, l: number) => [
      { a: p[i], b: p[j], c: p[k] },
      { a: p[i], b: p[k], c: p[l] },
    ];
    return [...quad(0, 1, 2, 3), ...quad(4, 7, 6, 5), ...quad(0, 4, 5, 1), ...quad(1, 5, 6, 2), ...quad(2, 6, 7, 3), ...quad(3, 7, 4, 0)];
  };
  const triangles = [...cubeTriangles({ x: 0, y: 0, z: 0 }), ...cubeTriangles({ x: 100, y: 0, z: 0 })];
  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 101, y: 1, z: 1 }, size: { x: 101, y: 1, z: 1 } };
  // evaluateSaveGate only reads triangles/scaleMmPerUnit/mmBounds — the cast covers the rest of MeshBuildResult's shape (watertight/sourceBounds), which it never touches.
  const fakeMesh = { triangles, scaleMmPerUnit: 1, mmBounds: bounds, sourceBounds: bounds } as unknown as Parameters<typeof evaluateSaveGate>[0];
  const gate = evaluateSaveGate(fakeMesh, { x: 1000, y: 1000, z: 1000 }, 0.2);
  assert.equal(gate.topology.connectedComponents, 2);
  assert.equal(gate.ok, false, "a 2-component mesh must fail the save gate, not be accepted as monolithic");
});

test("a fresh result exposes an algorithm version string and non-negative region/zero-gain diagnostics", () => {
  const fit = scaleFor("box");
  const params = baseParams({ targetSurfaceCoverage: 0.1, seed: "s21-diagnostics" });
  const result = growNetwork("box", completeEnvelope(), params, "coin-constrained", fit);
  assert.equal(result.algorithmVersion, O2_ALGORITHM_VERSION);
  // A fresh (non-legacy-migrated) result must never have these null — only a migrated pre-S2.1 stored recipe result does (see the C5 migration tests above).
  assert.ok(result.regionCount !== null && result.regionCount > 0);
  assert.ok(result.reachedRegionCount !== null && result.reachedRegionCount >= 0 && result.reachedRegionCount <= result.regionCount!);
  assert.ok(result.zeroGainAcceptedCount !== null && result.zeroGainAcceptedCount >= 0);
  assert.ok(Array.isArray(result.coverageCurve) && result.coverageCurve!.length > 0);
});

// === O2: Connected Base + Multi-source Upward Colonization ===================
// (Optimizer/docs/opus-instruction-20260725-katachi-interior-growth-connected-
// multisource.md §11.)

/** The exact conditions the O1 diagnosis and the O3 coverage gate are both stated at. */
function o2Conditions(hostId: HostFixtureId, target = 0.25) {
  const preset = findPrinterPreset("bambu-a1-mini");
  const envelope = completeEnvelope();
  const fit = fitHostToBuildVolume(hostId, envelope.buildAxis, preset.buildVolumeMm);
  const params: GrowthParams = { ...DEFAULT_GROWTH_PARAMS, targetSurfaceCoverage: target };
  return { preset, envelope, fit, params };
}

const O2_HOSTS: HostFixtureId[] = ["box", "sphere", "waisted"];
/** Grown once and shared: each of these is a full default-condition run, and re-growing per test would multiply an already slow suite by the number of assertions about it. */
const o2Runs = new Map<HostFixtureId, GrowthResult>();
for (const hostId of O2_HOSTS) {
  const { envelope, fit, params } = o2Conditions(hostId);
  o2Runs.set(hostId, growNetwork(hostId, envelope, params, "coin-constrained", fit.scaleMmPerUnit));
}

test("§11-2: there is exactly ONE graph root on every host (multiple plate CONTACTS, never multiple independent roots)", () => {
  for (const hostId of O2_HOSTS) {
    const r = o2Runs.get(hostId)!;
    assert.equal(r.rootCount, 1, `${hostId}: expected exactly 1 graph root`);
    assert.equal(r.units.filter((u) => u.parentId === null).length, 1, `${hostId}: exactly one parentless unit`);
  }
});

test("§11-1: the connected base gives more than one plate contact to launch trunks from", () => {
  for (const hostId of O2_HOSTS) {
    const r = o2Runs.get(hostId)!;
    assert.ok((r.launchPointCount ?? 0) >= 2, `${hostId}: expected >=2 launch points, got ${r.launchPointCount}`);
  }
});

test("§11-3: every base unit is supported — it has a parent, and its own material touches that parent", () => {
  for (const hostId of O2_HOSTS) {
    const r = o2Runs.get(hostId)!;
    const byId = new Map(r.units.map((u) => [u.id, u]));
    const baseUnits = r.units.filter((u) => u.role === "base");
    assert.ok(baseUnits.length > 0, `${hostId}: expected the connected base to exist at all`);
    for (const u of baseUnits) {
      assert.ok(u.parentId !== null, `${hostId}: base unit ${u.id} has no parent`);
      const parent = byId.get(u.parentId!);
      assert.ok(parent, `${hostId}: base unit ${u.id}'s parent is missing`);
      let minGap = Infinity;
      for (const a of u.points) for (const b of parent!.points) minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - a.r - b.r);
      assert.ok(minGap <= 0, `${hostId}: base unit ${u.id} does not touch its parent (gap ${minGap})`);
    }
  }
});

test("§11-3b: every unit on every host reaches the build plate through its parent chain", () => {
  for (const hostId of O2_HOSTS) {
    const r = o2Runs.get(hostId)!;
    assert.equal(countUnreachableUnits(r.units), 0, `${hostId}: every unit must reach a build-plate root`);
  }
});

test("§11-4: region assignment is identical for identical inputs, and §11-5 picks the lower-cost launch point", () => {
  const { envelope, fit, params } = o2Conditions("box");
  const samples = getCoverageReferenceMesh("box");
  const { regions } = computeSurfaceRegions(samples, hostBounds("box"), envelope.buildAxis);
  const aimOf = (region: { centroid: { x: number; y: number; z: number }; avgInwardNormal: { x: number; y: number; z: number } }) => ({
    x: region.centroid.x + region.avgInwardNormal.x * params.unitRadius * 0.5,
    y: region.centroid.y + region.avgInwardNormal.y * params.unitRadius * 0.5,
    z: region.centroid.z + region.avgInwardNormal.z * params.unitRadius * 0.5,
  });
  const launches = [
    { unitId: 1, centroid: { x: -0.9, y: -1, z: 0 } },
    { unitId: 2, centroid: { x: 0.9, y: -1, z: 0 } },
  ];
  const tiltRad = ((90 - envelope.supportThresholdAngleDeg - 3) * Math.PI) / 180;
  const step = params.unitRadius * 0.5;
  const a = assignRegionsToLaunchPoints(regions, launches, aimOf, envelope.buildAxis, tiltRad, step);
  const b = assignRegionsToLaunchPoints(regions, launches, aimOf, envelope.buildAxis, tiltRad, step);
  assert.deepEqual([...a.launchOf.entries()].sort(), [...b.launchOf.entries()].sort(), "same inputs must give the same assignment");

  // §11-5: a region on the -x side must be served by the -x launch point.
  let checkedLowerCost = 0;
  for (const [rid, launchId] of a.launchOf) {
    const region = regions.get(rid)!;
    const aim = aimOf(region);
    const c0 = estimateRouteUnitCost(launches[0].centroid, aim, envelope.buildAxis, tiltRad, step);
    const c1 = estimateRouteUnitCost(launches[1].centroid, aim, envelope.buildAxis, tiltRad, step);
    if (Math.abs(c0 - c1) < 1e-9) continue; // a genuine tie tells us nothing
    const cheaper = c0 < c1 ? 1 : 2;
    assert.equal(launchId, cheaper, `region ${rid} went to the more expensive launch point`);
    checkedLowerCost++;
  }
  assert.ok(checkedLowerCost > 0, "expected at least some regions with a strict cost preference");
  void fit;
});

test("§11-5b: estimateRouteUnitCost refuses a target that sits below the frontier (rule 5 never descends)", () => {
  const axis = { x: 0, y: 1, z: 0 };
  const tiltRad = (57 * Math.PI) / 180;
  const below = estimateRouteUnitCost({ x: 0, y: 1, z: 0 }, { x: 0.5, y: 0, z: 0 }, axis, tiltRad, 0.07);
  assert.equal(below, Infinity, "a target below the frontier must be reported unreachable, not merely expensive");
  const above = estimateRouteUnitCost({ x: 0, y: 0, z: 0 }, { x: 0.5, y: 1, z: 0 }, axis, tiltRad, 0.07);
  assert.ok(Number.isFinite(above) && above > 0);
});

test("§11-8: localTangentBasis really is orthogonal to the surface normal (and orthonormal)", () => {
  const normals = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0.577, y: 0.577, z: 0.577 },
    { x: -0.3, y: 0.8, z: 0.51 },
  ];
  for (const n of normals) {
    const len = Math.hypot(n.x, n.y, n.z);
    const unit = { x: n.x / len, y: n.y / len, z: n.z / len };
    const { t1, t2 } = localTangentBasis(unit);
    for (const [name, t] of [["t1", t1], ["t2", t2]] as const) {
      assert.ok(Math.abs(t.x * unit.x + t.y * unit.y + t.z * unit.z) < 1e-9, `${name} not orthogonal to the normal`);
      assert.ok(Math.abs(Math.hypot(t.x, t.y, t.z) - 1) < 1e-9, `${name} not unit length`);
    }
    assert.ok(Math.abs(t1.x * t2.x + t1.y * t2.y + t1.z * t2.z) < 1e-9, "t1/t2 not orthogonal to each other");
    // A direction projected onto the tangent plane must have no normal component left.
    const projected = projectOntoTangentPlane({ x: 1, y: 2, z: -3 }, unit, 0, t1);
    assert.ok(Math.abs(projected.x * unit.x + projected.y * unit.y + projected.z * unit.z) < 1e-9, "projection left a normal component");
  }
});

test("§6.2: isSurfaceTraversable matches the re-derived |90deg - alpha| <= tilt cone", () => {
  const axis = { x: 0, y: 1, z: 0 };
  const tiltRad = (57 * Math.PI) / 180;
  // Equator of a sphere: outward normal horizontal (alpha = 90deg) -> traversable.
  assert.equal(isSurfaceTraversable({ x: -1, y: 0, z: 0 }, axis, tiltRad), true);
  // A ceiling: outward normal straight up (alpha = 0) -> not traversable.
  assert.equal(isSurfaceTraversable({ x: 0, y: -1, z: 0 }, axis, tiltRad), false);
  // A floor: outward normal straight down (alpha = 180deg) -> not traversable by surface-following.
  assert.equal(isSurfaceTraversable({ x: 0, y: 1, z: 0 }, axis, tiltRad), false);
  // The sphere's own measured cutoff: at y=-1.0 on R=1.15 the meridional tangent
  // is 60.5deg from vertical, past the 57deg cone.
  const rho = Math.sqrt(1.15 * 1.15 - 1.0);
  const outward = { x: rho / 1.15, y: -1.0 / 1.15, z: 0 };
  assert.equal(isSurfaceTraversable({ x: -outward.x, y: -outward.y, z: -outward.z }, axis, tiltRad), false);
});

test("§11-9: coverage never decreases as accepted units are added", () => {
  const r = o2Runs.get("waisted")!;
  const samples = getCoverageReferenceMesh("waisted");
  const probe = computeProbeDepthField(r.params.unitRadius);
  let previous = -1;
  for (const cut of [1, Math.floor(r.units.length / 3), Math.floor((2 * r.units.length) / 3), r.units.length]) {
    const c = computeSurfaceCoverage(samples, r.units.slice(0, cut), probe);
    assert.ok(c.measuredCoverage >= previous - 1e-12, `coverage dropped from ${previous} to ${c.measuredCoverage} at ${cut} units`);
    previous = c.measuredCoverage;
  }
  // And the run's own coverage curve is likewise non-decreasing.
  const curve = r.coverageCurve!;
  for (let i = 1; i < curve.length; i++) {
    assert.ok(curve[i] >= curve[i - 1] - 1e-9, `coverage curve went backwards at index ${i}`);
  }
});

test("§11-10: default-condition coin-constrained 25% matrix reaches >=23% on box/sphere/waisted, reproducibly", () => {
  for (const hostId of O2_HOSTS) {
    const r = o2Runs.get(hostId)!;
    assert.ok(
      r.measuredSurfaceCoverage >= 0.23,
      `${hostId}: measured ${(r.measuredSurfaceCoverage * 100).toFixed(2)}% < 23% (stop reason ${r.coverageStopReason})`,
    );
    assert.equal(r.coverageStopReason, "target-reached", `${hostId}: budget exhaustion is never reported as success`);
    assert.ok(r.heightCoverage >= 0.95, `${hostId}: height coverage ${r.heightCoverage} < 0.95`);
  }
  // Same seed, same conditions -> same number, re-grown from scratch.
  const { envelope, fit, params } = o2Conditions("box");
  const again = growNetwork("box", envelope, params, "coin-constrained", fit.scaleMmPerUnit);
  assert.equal(again.units.length, o2Runs.get("box")!.units.length);
  assert.equal(again.measuredSurfaceCoverage, o2Runs.get("box")!.measuredSurfaceCoverage);
});

test("§11-11: the saved mesh of every default-condition coin candidate is a single component and passes the save gate", () => {
  const preset = findPrinterPreset("bambu-a1-mini");
  for (const hostId of O2_HOSTS) {
    const r = o2Runs.get(hostId)!;
    const mesh = buildCandidateMesh(r, 64, r.params.unitRadius * 0.3);
    const gate = evaluateSaveGate(mesh, preset.buildVolumeMm, r.envelope.layerHeightMm);
    assert.equal(gate.topology.connectedComponents, 1, `${hostId}: expected 1 mesh component`);
    assert.equal(gate.ok, true, `${hostId}: save gate failed — ${gate.reasons.join(" / ")}`);
  }
});

test("§7: a ring's material is a capsule chain, so its own nodes form ONE piece even though their spheres do not touch", () => {
  const { envelope, fit, params } = o2Conditions("sphere");
  const r = growNetwork("sphere", envelope, params, "ring-constrained", fit.scaleMmPerUnit);
  const ring = r.units.find((u) => u.kind === "ring" && u.points.length > 2);
  assert.ok(ring, "expected at least one multi-node ring unit");
  // The measured fact this fix rests on: consecutive ring node SPHERES do not touch.
  let anyNodePairTouches = false;
  for (let i = 0; i < ring!.points.length; i++) {
    const a = ring!.points[i];
    const b = ring!.points[(i + 1) % ring!.points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - a.r - b.r <= 0) anyNodePairTouches = true;
  }
  assert.equal(anyNodePairTouches, false, "ring node spheres are expected NOT to touch — that is why the mesh field models capsules");
  // But the field between two consecutive nodes IS material.
  const a = ring!.points[0];
  const b = ring!.points[1];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  assert.ok(unitsPointsSdf([ring!], 1e-6, mid.x, mid.y, mid.z) < 0, "the midpoint between two ring nodes must be inside the ring's material");
  assert.ok(isInsideUnitMaterial(mid, ring!), "coverage must agree with the mesh field about that same point");
});

/** Bound on the difference between the exact and indexed field forms, in field units. Measured max drift is ~2.5e-3; this leaves headroom without being loose enough to hide a real divergence. */
const SAMPLER_TOLERANCE = 0.01;

test("§9: the indexed field sampler agrees with the exact definition wherever the field is near zero", () => {
  const r = o2Runs.get("waisted")!;
  const blendK = r.params.unitRadius * 0.3;
  const sampler = createUnitsFieldSampler(r.units, blendK);
  const b = hostBounds("waisted");
  let compared = 0;
  let maxDiff = 0;
  // Deterministic lattice, not RNG — a flaky tolerance test is worse than none.
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      for (let k = 0; k < 12; k++) {
        const x = b.min.x + (b.size.x * (i + 0.5)) / 12;
        const y = b.min.y + (b.size.y * (j + 0.5)) / 12;
        const z = b.min.z + (b.size.z * (k + 0.5)) / 12;
        const exact = unitsPointsSdf(r.units, blendK, x, y, z);
        if (exact > 0.15) continue; // far field is deliberately approximated — see createUnitsFieldSampler
        const indexed = sampler(x, y, z);
        const diff = Math.abs(exact - indexed);
        maxDiff = Math.max(maxDiff, diff);
        // Sequential smooth-min is order-dependent, and the two forms visit
        // elements in different orders (unit order vs. spatial-cell order), so
        // within a thin band around the isosurface the two can legitimately
        // straddle zero. Sign agreement is asserted only OUTSIDE that band; the
        // band's width is itself bounded by the tolerance below, so this is a
        // measured statement rather than an escape hatch.
        if (Math.abs(exact) > SAMPLER_TOLERANCE) {
          assert.ok(exact < 0 === indexed < 0, `sign disagreement at (${x},${y},${z}): exact ${exact} vs indexed ${indexed}`);
        }
        compared++;
      }
    }
  }
  assert.ok(compared > 0, "expected the lattice to land near material somewhere");
  // Sequential smooth-min is order-dependent, so the two are close but not bit-identical.
  assert.ok(maxDiff < SAMPLER_TOLERANCE, `indexed sampler drifted from the exact field by ${maxDiff}`);
});

test("§11-16: a fresh O2 result round-trips through recipe export -> import with its new fields intact", () => {
  const r = o2Runs.get("box")!;
  const text = serializeRecipe([{ t: 1, op: "generateCandidates", args: { results: [r] } } as HistoryEntry]);
  const { entries, legacyMigrated } = parseRecipe(text);
  assert.equal(legacyMigrated, false, "a fresh O2 recipe must not be flagged as migrated");
  const back = replay(entries).results[0];
  assert.equal(back.algorithmVersion, O2_ALGORITHM_VERSION);
  assert.equal(back.launchPointCount, r.launchPointCount);
  assert.equal(back.assignedRegionCount, r.assignedRegionCount);
  assert.equal(back.measuredSurfaceCoverage, r.measuredSurfaceCoverage);
  assert.equal(back.coverageStopReason, r.coverageStopReason);
  assert.deepEqual(back.units.map((u) => u.role), r.units.map((u) => u.role));
});

test("§11-16b: a stored result predating the O2 fields is migrated to nulls and role 'unknown', never to fabricated zeros", () => {
  const r = o2Runs.get("box")!;
  // Strip exactly the fields O2 added, as an older stored recipe would lack them.
  const legacy = JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
  delete legacy.launchPointCount;
  delete legacy.assignedRegionCount;
  delete legacy.meanAssignedRouteCost;
  delete legacy.meanSingleSourceRouteCost;
  (legacy.units as Record<string, unknown>[]).forEach((u) => delete u.role);
  const text = serializeRecipe([{ t: 1, op: "generateCandidates", args: { results: [legacy] } } as unknown as HistoryEntry]);
  const { entries, legacyMigrated } = parseRecipe(text);
  assert.equal(legacyMigrated, true, "a pre-O2 stored result must be reported as migrated");
  const back = replay(entries).results[0];
  assert.equal(back.launchPointCount, null);
  assert.equal(back.assignedRegionCount, null);
  assert.equal(back.meanAssignedRouteCost, null);
  assert.ok(back.units.every((u) => u.role === "unknown"), "every unit of a pre-O2 result must read 'unknown', not a guessed category");
});

test("§11-15: growNetwork's progress hook is monotone and can stop the run early (the Worker's cancel path)", () => {
  const { envelope, fit, params } = o2Conditions("box");
  const seen: { completed: number; total: number }[] = [];
  const result = growNetwork("box", envelope, params, "coin-constrained", fit.scaleMmPerUnit, {
    onProgress: (completed, total) => {
      seen.push({ completed, total });
      return completed < 120; // ask to stop once 120 units are accepted
    },
  });
  assert.ok(seen.length > 0, "progress must be reported at all");
  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i].completed >= seen[i - 1].completed, `progress went backwards at ${i}`);
    assert.ok(seen[i].total > 0, "progress total must be a real ceiling");
  }
  // Cancelling produces a real, honest result — never one reported as target-reached.
  assert.ok(result.units.length < 200, `expected an early stop, got ${result.units.length} units`);
  assert.notEqual(result.coverageStopReason, "target-reached", "a cancelled run must never claim it reached the target");
  assert.ok(result.measuredSurfaceCoverage >= 0, "a cancelled run still reports its real measured coverage");
});

// === P1: generation context — stale-result mixing ===========================
// (Optimizer/docs/opus-correction-20260725-katachi-interior-growth-worker-
// state-and-plate-metrics.md §1.4. The logic is deliberately in
// generationContext.ts rather than main.ts so it can be tested without a DOM.)

function baseContext(overrides: Partial<GenerationContext> = {}): GenerationContext {
  const envelope = completeEnvelope();
  const preset = findPrinterPreset("bambu-a1-mini");
  const fit = fitHostToBuildVolume("box", envelope.buildAxis, preset.buildVolumeMm);
  return {
    hostId: "box",
    printerPresetId: "bambu-a1-mini",
    buildVolumeMm: { ...preset.buildVolumeMm },
    envelope,
    params: { ...DEFAULT_GROWTH_PARAMS, targetSurfaceCoverage: 0.25 },
    canonicalScaleMmPerUnit: fit.scaleMmPerUnit,
    variants: ["field-only", "coin-constrained", "ring-constrained"],
    meshResolution: 64,
    blendK: DEFAULT_GROWTH_PARAMS.unitRadius * 0.3,
    ...overrides,
  };
}

test("§1.4-1: a result whose request snapshot still matches the current state is accepted", () => {
  const started = baseContext();
  // Rebuilt independently, not the same object — equality must be structural.
  const current = baseContext();
  assert.equal(isGenerationContextCurrent(started, current), true);
  assert.equal(generationContextKey(started), generationContextKey(current));
});

test("§1.4-2: changing ONLY the host makes the in-flight result unacceptable (the reproduced box->sphere bug)", () => {
  const started = baseContext({ hostId: "box" });
  const current = baseContext({ hostId: "sphere" });
  assert.equal(isGenerationContextCurrent(started, current), false);
});

test("§1.4-3: changing ONLY the target coverage makes the in-flight result unacceptable", () => {
  const started = baseContext();
  const current = baseContext({ params: { ...DEFAULT_GROWTH_PARAMS, targetSurfaceCoverage: 0.5 } });
  assert.equal(isGenerationContextCurrent(started, current), false);
});

test("§1.4-4: changing ONLY the printer / build volume makes the in-flight result unacceptable", () => {
  const started = baseContext();
  const a1 = findPrinterPreset("bambu-a1");
  const fitA1 = fitHostToBuildVolume("box", started.envelope.buildAxis, a1.buildVolumeMm);
  assert.equal(
    isGenerationContextCurrent(started, baseContext({ printerPresetId: "bambu-a1", buildVolumeMm: { ...a1.buildVolumeMm }, canonicalScaleMmPerUnit: fitA1.scaleMmPerUnit })),
    false,
  );
  // A custom build volume of a different size must also invalidate, even at the same preset id.
  assert.equal(isGenerationContextCurrent(started, baseContext({ buildVolumeMm: { x: 180, y: 180, z: 200 } })), false);
});

test("§1.4-5: changing ONLY the layer height, ONLY the support angle, or ONLY the seed each make the result unacceptable", () => {
  const started = baseContext();
  assert.equal(isGenerationContextCurrent(started, baseContext({ envelope: completeEnvelope({ layerHeightMm: 0.3 }) })), false);
  assert.equal(isGenerationContextCurrent(started, baseContext({ envelope: completeEnvelope({ supportThresholdAngleDeg: 45 }) })), false);
  assert.equal(isGenerationContextCurrent(started, baseContext({ params: { ...DEFAULT_GROWTH_PARAMS, targetSurfaceCoverage: 0.25, seed: "different" } })), false);
});

test("§1.4-5b: every remaining generation input is part of the context key (no field silently omitted)", () => {
  const started = baseContext();
  const mutations: [string, GenerationContext][] = [
    ["buildAxis", baseContext({ envelope: completeEnvelope({ buildAxis: { x: 1, y: 0, z: 0 } }) })],
    ["unitKind", baseContext({ params: { ...started.params, unitKind: "ring" } })],
    ["unitRadius", baseContext({ params: { ...started.params, unitRadius: 0.18 } })],
    ["lift", baseContext({ params: { ...started.params, lift: 0.9 } })],
    ["drift", baseContext({ params: { ...started.params, drift: 0.9 } })],
    ["cohesion", baseContext({ params: { ...started.params, cohesion: 0.9 } })],
    ["branching", baseContext({ params: { ...started.params, branching: 0.9 } })],
    ["voidBias", baseContext({ params: { ...started.params, voidBias: 0.9 } })],
    ["ringNodeCount", baseContext({ params: { ...started.params, ringNodeCount: 12 } })],
    ["ringTubeR", baseContext({ params: { ...started.params, ringTubeR: 0.4 } })],
    ["rootTarget", baseContext({ params: { ...started.params, rootTarget: 9 } })],
    ["canonicalScale", baseContext({ canonicalScaleMmPerUnit: started.canonicalScaleMmPerUnit + 1 })],
    ["variants", baseContext({ variants: ["field-only"] })],
    ["meshResolution", baseContext({ meshResolution: 96 })],
    ["blendK", baseContext({ blendK: started.blendK * 2 })],
  ];
  for (const [name, mutated] of mutations) {
    assert.equal(isGenerationContextCurrent(started, mutated), false, `changing ${name} must invalidate an in-flight run`);
  }
});

test("§1.4: the context key is stable across structurally-identical states built along different paths", () => {
  const a = baseContext();
  // Same values, different object identity and different key insertion order.
  const b = baseContext({
    params: {
      targetSurfaceCoverage: 0.25,
      rootTarget: DEFAULT_GROWTH_PARAMS.rootTarget,
      ringTubeR: DEFAULT_GROWTH_PARAMS.ringTubeR,
      ringNodeCount: DEFAULT_GROWTH_PARAMS.ringNodeCount,
      unitRadius: DEFAULT_GROWTH_PARAMS.unitRadius,
      unitKind: DEFAULT_GROWTH_PARAMS.unitKind,
      voidBias: DEFAULT_GROWTH_PARAMS.voidBias,
      branching: DEFAULT_GROWTH_PARAMS.branching,
      cohesion: DEFAULT_GROWTH_PARAMS.cohesion,
      drift: DEFAULT_GROWTH_PARAMS.drift,
      lift: DEFAULT_GROWTH_PARAMS.lift,
      seed: DEFAULT_GROWTH_PARAMS.seed,
    },
  });
  assert.equal(generationContextKey(a), generationContextKey(b));
});

/**
 * §1.4 items 6 and 7 are about main.ts's own acceptance step. Reproduced here
 * as a small model of that step so the ORDERING is pinned by a test rather
 * than by reading the file: nothing may be written unless BOTH the requestId
 * and the context key still match, so a dropped message cannot clear or
 * overwrite results that are already good.
 */
function makeAcceptor() {
  const store = { results: ["previous-good-result"], meshCacheWrites: 0, historyWrites: 0 };
  let active: { requestId: number; key: string } | null = null;
  return {
    store,
    start(requestId: number, context: GenerationContext) {
      active = { requestId, key: generationContextKey(context) };
    },
    cancel() {
      active = null;
    },
    /** Returns true when the message was ACTED ON. */
    receive(requestId: number, current: GenerationContext, payload: string[]): boolean {
      if (!active || requestId !== active.requestId || active.key !== generationContextKey(current)) return false;
      active = null;
      store.results = payload;
      store.meshCacheWrites++;
      store.historyWrites++;
      return true;
    },
  };
}

test("§1.4-6: a cancelled request's result is not accepted", () => {
  const ctx = baseContext();
  const a = makeAcceptor();
  a.start(1, ctx);
  a.cancel();
  assert.equal(a.receive(1, ctx, ["box-1513"]), false);
  assert.deepEqual(a.store.results, ["previous-good-result"]);
  assert.equal(a.store.historyWrites, 0);
});

test("§1.4-7: dropping a stale result leaves the existing good results, caches and history untouched", () => {
  const started = baseContext({ hostId: "box" });
  const a = makeAcceptor();
  a.start(1, started);
  // The author switched to sphere while the box run was still going.
  const now = baseContext({ hostId: "sphere" });
  assert.equal(a.receive(1, now, ["box-530", "box-436", "box-547"]), false);
  assert.deepEqual(a.store.results, ["previous-good-result"], "a stale result must never be written, not even to be cleaned up afterwards");
  assert.equal(a.store.meshCacheWrites, 0);
  assert.equal(a.store.historyWrites, 0);
  // A matching run afterwards is still accepted normally.
  a.start(2, now);
  assert.equal(a.receive(2, now, ["sphere-486", "sphere-625", "sphere-288"]), true);
  assert.deepEqual(a.store.results, ["sphere-486", "sphere-625", "sphere-288"]);
});

// === P2: plate-contact metric separation ====================================
// (Optimizer/docs/opus-correction-20260725-katachi-interior-growth-worker-
// state-and-plate-metrics.md §2.4. Fixtures below are built in mm against the
// layer height, deliberately NOT by restating implementation constants.)

/** A single sphere of radius `rField` whose CENTRE sits `centreAboveField` above the plate. */
function plateFixtureUnit(id: number, centreAboveField: number, rField: number, plateOffset: number): GrowthUnit {
  return syntheticUnit({
    id,
    kind: "coin",
    points: [{ x: 0, y: plateOffset + centreAboveField, z: 0, r: rField }],
  });
}

test("§2.4-2: a unit whose CENTROID is near the plate but whose material floats more than a layer is NOT a contact", () => {
  const axis = { x: 0, y: 1, z: 0 };
  const plateOffset = -1;
  const scaleMmPerUnit = 81; // box @ A1 mini, the shipped canonical scale
  const layerHeightMm = 0.2;
  // Material lowest point = centre - r. Put it a full 2mm (10 layers) up.
  const floatMm = 2;
  const rField = 0.05;
  const centreAboveField = rField + floatMm / scaleMmPerUnit;
  const u = plateFixtureUnit(1, centreAboveField, rField, plateOffset);
  const clearanceMm = unitPlateClearanceMm(u, axis, plateOffset, scaleMmPerUnit);
  assert.ok(Math.abs(clearanceMm - floatMm) < 1e-6, `expected ${floatMm}mm clearance, got ${clearanceMm}`);
  assert.equal(isUnitOnPlate(u, axis, plateOffset, scaleMmPerUnit, layerHeightMm), false);
  // The OLD centroid-based near-plate rule would have accepted this exact unit
  // (centroid within 2x the point radius of the plate) — that is the bug.
  const centroidGapField = Math.abs(centreAboveField);
  assert.ok(centroidGapField <= rField * 2, "fixture must be inside the old coarse near-plate band, or it proves nothing");
});

test("§2.4-3: a unit whose material lowest extent lands inside the one-layer band IS a contact", () => {
  const axis = { x: 0, y: 1, z: 0 };
  const plateOffset = -1;
  const scaleMmPerUnit = 81;
  const layerHeightMm = 0.2;
  const rField = 0.05;
  for (const clearanceMm of [-0.5, -0.108, 0, 0.047, 0.19]) {
    const u = plateFixtureUnit(1, rField + clearanceMm / scaleMmPerUnit, rField, plateOffset);
    assert.equal(
      isUnitOnPlate(u, axis, plateOffset, scaleMmPerUnit, layerHeightMm),
      true,
      `clearance ${clearanceMm}mm should count as contact (tolerance is one ${layerHeightMm}mm layer)`,
    );
  }
  // Just past one layer it must stop counting — the boundary is the layer height.
  const justOver = plateFixtureUnit(1, rField + 0.2001 / scaleMmPerUnit, rField, plateOffset);
  assert.equal(isUnitOnPlate(justOver, axis, plateOffset, scaleMmPerUnit, layerHeightMm), false);
});

test("§2.4-3b: a ring's contact is judged from its capsule material, not its node centres", () => {
  const axis = { x: 0, y: 1, z: 0 };
  const plateOffset = 0;
  const scaleMmPerUnit = 81;
  const ring = syntheticUnit({
    id: 1,
    kind: "ring",
    points: [
      { x: 0.2, y: 0.04, z: 0, r: 0.039 },
      { x: 0, y: 0.04, z: 0.2, r: 0.039 },
      { x: -0.2, y: 0.04, z: 0, r: 0.039 },
      { x: 0, y: 0.04, z: -0.2, r: 0.039 },
    ],
  });
  // Lowest material = 0.04 - 0.039 = 0.001 field = 0.081mm, inside one layer.
  const clearance = unitPlateClearanceMm(ring, axis, plateOffset, scaleMmPerUnit);
  assert.ok(Math.abs(clearance - 0.001 * scaleMmPerUnit) < 1e-6, `got ${clearance}`);
  assert.equal(isUnitOnPlate(ring, axis, plateOffset, scaleMmPerUnit, 0.2), true);
});

test("§2.4-1 & §2.4-6: actualPlateContactCount is measured after the base is built, and is >=2 on all three default coin hosts", () => {
  for (const hostId of O2_HOSTS) {
    const r = o2Runs.get(hostId)!;
    const { envelope, fit } = o2Conditions(hostId);
    const plateOffset = buildPlateOffset(hostId, envelope.buildAxis);
    assert.ok(r.actualPlateContactCount >= 2, `${hostId}: actualPlateContactCount ${r.actualPlateContactCount} < 2`);
    // Recomputing it from the FINAL unit set must reproduce the stored number —
    // i.e. it was taken after every growth stage, not before the base existed.
    const recomputed = countActualPlateContacts(r.units, envelope.buildAxis, plateOffset, fit.scaleMmPerUnit, envelope.layerHeightMm);
    assert.equal(r.actualPlateContactCount, recomputed, `${hostId}: stored count disagrees with a fresh count over the final units`);
    // And it must exceed what a count taken before the base would have given.
    const preBase = countActualPlateContacts(
      r.units.filter((u) => u.role === "root" || u.role === "primary-path"),
      envelope.buildAxis, plateOffset, fit.scaleMmPerUnit, envelope.layerHeightMm,
    );
    assert.ok(recomputed > preBase, `${hostId}: base contributed no plate contacts (${recomputed} vs ${preBase})`);
  }
});

test("§2.4-4: rootCount, actualPlateContactCount and launchPointCount are three DIFFERENT numbers and all survive a recipe round-trip", () => {
  for (const hostId of O2_HOSTS) {
    const r = o2Runs.get(hostId)!;
    const { envelope, fit } = o2Conditions(hostId);
    const plateOffset = buildPlateOffset(hostId, envelope.buildAxis);
    const axis = envelope.buildAxis;

    assert.equal(r.rootCount, 1, `${hostId}: exactly one graph root`);
    assert.ok(r.actualPlateContactCount > r.rootCount, `${hostId}: contacts should exceed the single graph root`);
    assert.notEqual(r.actualPlateContactCount, r.launchPointCount, `${hostId}: the two plate numbers must not be the same value under different names — that was the bug`);

    // The true containment: over the SAME (final) unit set, everything that
    // actually touches the plate is inside the coarse near-plate set.
    // `launchPointCount` is NOT comparable by inequality to either, because it
    // is a snapshot taken mid-growth, when the base had been built but the
    // spread stage had not yet added its own plate-resting units.
    const nearPlateFinal = r.units.filter((u) => {
      const maxR = u.points.reduce((m, p) => Math.max(m, p.r), 0.01);
      const h = unitCentroid(u).x * axis.x + unitCentroid(u).y * axis.y + unitCentroid(u).z * axis.z;
      return Math.abs(h - plateOffset) <= maxR * 2;
    });
    const contacts = r.units.filter((u) => isUnitOnPlate(u, axis, plateOffset, fit.scaleMmPerUnit, envelope.layerHeightMm));
    const nearIds = new Set(nearPlateFinal.map((u) => u.id));
    for (const u of contacts) {
      assert.ok(nearIds.has(u.id), `${hostId}: unit ${u.id} counts as a material contact but not as near-plate`);
    }
    assert.equal(contacts.length, r.actualPlateContactCount, `${hostId}: stored contact count must equal a fresh count`);
    assert.ok(nearPlateFinal.length >= contacts.length, `${hostId}: near-plate must be the looser set`);

    const text = serializeRecipe([{ t: 1, op: "generateCandidates", args: { results: [r] } } as HistoryEntry]);
    const back = replay(parseRecipe(text).entries).results[0];
    assert.equal(back.rootCount, r.rootCount);
    assert.equal(back.actualPlateContactCount, r.actualPlateContactCount);
    assert.equal(back.launchPointCount, r.launchPointCount);
  }
});

test("§2.4-5: a stored result predating actualPlateContactCount migrates to null, never to a fabricated 0", () => {
  const r = o2Runs.get("box")!;
  const legacy = JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
  delete legacy.actualPlateContactCount;
  const text = serializeRecipe([{ t: 1, op: "generateCandidates", args: { results: [legacy] } } as unknown as HistoryEntry]);
  const { entries, legacyMigrated } = parseRecipe(text);
  assert.equal(legacyMigrated, true);
  const back = replay(entries).results[0];
  assert.equal(back.actualPlateContactCount, null, "an unmeasured plate-contact count must read null, not 0");
});

test("§2.4-7: the existing structural gates still hold — one root, every unit reaches it, every base unit has a parent", () => {
  for (const hostId of O2_HOSTS) {
    const r = o2Runs.get(hostId)!;
    assert.equal(r.rootCount, 1, `${hostId}: exactly one graph root`);
    assert.equal(countUnreachableUnits(r.units), 0, `${hostId}: every unit must reach the build-plate root`);
    for (const u of r.units.filter((x) => x.role === "base")) {
      assert.ok(u.parentId !== null, `${hostId}: base unit ${u.id} has no parent`);
    }
  }
});

// === P2.1: rule 2b uses the SAME mm/layer plate criterion as the metric =====
// (Optimizer/docs/sonnet-correction-20260725-katachi-interior-growth-plate-
// support-and-export-plane.md §2 and §4. These REPLACE the earlier test that
// asserted only "inside rule 2b's own radius band / not beyond 2.5mm" — that
// test codified the defect as acceptable instead of catching it.)

const P21_SCALE_MM_PER_UNIT = 81; // box @ A1 mini, the shipped canonical scale
const P21_LAYER_MM = 0.2;

/**
 * A descending single-sphere candidate whose MATERIAL lowest extent floats
 * `clearanceMm` above the build plate. Descending on purpose: a negative-rise
 * step is only ever accepted via rule 2b's plate-support exemption, so
 * acceptance here is a direct read-out of that exemption.
 */
function plateSupportCandidate(clearanceMm: number, kind: GrowthUnitKind = "coin") {
  const plateOffset = -1; // box's lowest point along +y
  const rField = 0.08;
  const centreY = plateOffset + rField + clearanceMm / P21_SCALE_MM_PER_UNIT;
  const points: GrowthUnitPoint[] =
    kind === "coin"
      ? [{ x: 0, y: centreY, z: 0, r: rField }]
      : // A horizontal ring of nodes at the same height: its capsule chain's
        // lowest extent is the same `centre - r`, so coin and ring must agree.
        [
          { x: 0.12, y: centreY, z: 0, r: rField },
          { x: 0, y: centreY, z: 0.12, r: rField },
          { x: -0.12, y: centreY, z: 0, r: rField },
          { x: 0, y: centreY, z: -0.12, r: rField },
        ];
  const parentPoints: GrowthUnitPoint[] = [{ x: 0, y: -0.85, z: 0, r: 0.1 }];
  const input: EvaluateInput = evalInputBase({
    hostId: "box",
    isRoot: false,
    center: { x: 0, y: centreY, z: 0 },
    plateOffset,
    canonicalScaleMmPerUnit: P21_SCALE_MM_PER_UNIT,
    envelope: completeEnvelope({ layerHeightMm: P21_LAYER_MM }),
    kind,
    // 90deg from buildAxis, so the ring-horizontal rule is satisfied for the ring case.
    heading: { x: 1, y: 0, z: 0 },
    parentPoints,
    parentCentroid: { x: 0, y: -0.85, z: 0 },
  });
  return { input, points, plateOffset, kind };
}

test("§4 rule2b-1: a candidate whose material floats 0.19mm above the plate IS plate-supported at a 0.2mm layer height", () => {
  const { input, points } = plateSupportCandidate(0.19);
  assert.ok(lowestMaterialField("coin", points, input.buildAxis) - input.plateOffset > 0, "fixture must float ABOVE the plate");
  const clearance = plateClearanceMm(lowestMaterialField("coin", points, input.buildAxis), input.plateOffset, P21_SCALE_MM_PER_UNIT);
  assert.ok(Math.abs(clearance - 0.19) < 1e-6, `fixture clearance ${clearance}`);
  const outcome = evaluateCandidate(input, points);
  assert.equal(outcome.accepted, true, `expected plate support to excuse the descending step, got ${outcome.reason}`);
  assert.ok(outcome.verticalStepField < 0, "fixture must be a descending step");
});

test("§4 rule2b-2: 0.2001mm — one hair past a single layer — is NOT plate-supported", () => {
  const { input, points } = plateSupportCandidate(0.2001);
  const outcome = evaluateCandidate(input, points);
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.reason, "negative-rise-rejected", "past one layer the plate no longer excuses a descending step");
});

test("§4 rule2b-3: a candidate floating 2mm above the plate gets NO negative-rise or overhang exemption", () => {
  // 2mm is inside the OLD unit-radius band (~1.8-2.2mm at these defaults) and
  // was accepted before this fix. That is the whole defect.
  const { input, points } = plateSupportCandidate(2);
  const outcome = evaluateCandidate(input, points);
  assert.equal(outcome.accepted, false, "a unit 2mm off the plate must not be called plate-supported");
  assert.equal(outcome.reason, "negative-rise-rejected");
  const lateral = plateSupportCandidate(2);
  const shifted = lateral.points.map((p) => ({ ...p, x: p.x + 0.06 }));
  const outcome2 = evaluateCandidate({ ...lateral.input, center: { x: 0.06, y: lateral.input.center.y, z: 0 } }, shifted);
  assert.equal(outcome2.accepted, false);
});

test("§4 rule2b-4: coin and ring reach the same plate-support verdict from the same material lowest extent", () => {
  for (const clearanceMm of [0.05, 0.19, 0.2001, 2]) {
    const coin = plateSupportCandidate(clearanceMm, "coin");
    const ring = plateSupportCandidate(clearanceMm, "ring");
    const coinLowest = lowestMaterialField("coin", coin.points, coin.input.buildAxis);
    const ringLowest = lowestMaterialField("ring", ring.points, ring.input.buildAxis);
    assert.ok(Math.abs(coinLowest - ringLowest) < 1e-12, `coin/ring material lowest disagree at ${clearanceMm}mm`);
    const onPlate = (lowest: number) => isOnPlateMm(plateClearanceMm(lowest, coin.plateOffset, P21_SCALE_MM_PER_UNIT), P21_LAYER_MM);
    assert.equal(onPlate(coinLowest), onPlate(ringLowest), `coin/ring verdict differs at ${clearanceMm}mm`);
    assert.equal(onPlate(coinLowest), clearanceMm <= P21_LAYER_MM);
  }
});

test("§4 rule2b-5 & rule2b-6: on all three default coin hosts, ZERO plate-support-exempt units float more than one layer", () => {
  for (const hostId of O2_HOSTS) {
    const r = o2Runs.get(hostId)!;
    const { envelope, fit } = o2Conditions(hostId);
    const plateOffset = buildPlateOffset(hostId, envelope.buildAxis);
    const axis = envelope.buildAxis;
    const byId = new Map(r.units.map((u) => [u.id, u]));
    const proj = (v: { x: number; y: number; z: number }) => v.x * axis.x + v.y * axis.y + v.z * axis.z;
    let descending = 0;
    let floating = 0;
    let worstMm = -Infinity;
    for (const u of r.units) {
      if (u.parentId === null) continue;
      const rise = proj(unitCentroid(u)) - proj(unitCentroid(byId.get(u.parentId)!));
      if (rise >= -1e-9) continue;
      descending++;
      const clearanceMm = unitPlateClearanceMm(u, axis, plateOffset, fit.scaleMmPerUnit);
      if (!isUnitOnPlate(u, axis, plateOffset, fit.scaleMmPerUnit, envelope.layerHeightMm)) {
        floating++;
        worstMm = Math.max(worstMm, clearanceMm);
      }
      assert.ok(
        clearanceMm <= envelope.layerHeightMm + 1e-9,
        `${hostId}: unit ${u.id} descended while floating ${clearanceMm.toFixed(3)}mm above the plate`,
      );
    }
    assert.ok(descending > 0, `${hostId}: expected the connected base to take descending steps`);
    assert.equal(floating, 0, `${hostId}: ${floating} plate-support-exempt units float more than one layer (worst ${worstMm.toFixed(3)}mm)`);
  }
});

// === P2.2: the saved mesh must not extend below the build plate =============
// (Optimizer/docs/sonnet-correction-20260725-katachi-interior-growth-plate-
// support-and-export-plane.md §3, §4. These REPLACE the earlier test that
// accepted any dip smaller than blendK — that test substituted a different,
// easier requirement for the one that was asked for.)

test("§4 mesh-1: even a smooth-min blob resting ON the plate meshes with no material below it", () => {
  // The defect's own mechanism in isolation: the blend inflates material
  // outward, so a unit sitting on the plate used to bleed below it.
  const envelope = completeEnvelope();
  const params = baseParams({ targetSurfaceCoverage: 0.25 });
  const fit = scaleFor("box");
  const plateOffset = buildPlateOffset("box", envelope.buildAxis);
  // Two overlapping spheres straddling the plate plane — guaranteed to have
  // material at and below the plate before clipping.
  const onPlate: GrowthResult = {
    ...o2Runs.get("box")!,
    units: [
      syntheticUnit({ id: 1, kind: "coin", points: [{ x: 0, y: plateOffset + 0.02, z: 0, r: 0.12 }] }),
      syntheticUnit({ id: 2, kind: "coin", points: [{ x: 0.1, y: plateOffset + 0.06, z: 0, r: 0.12 }], parentId: 1, supportContact: "parent" }),
    ],
    canonicalScaleMmPerUnit: fit,
  };
  const mesh = buildCandidateMesh(onPlate, 48, params.unitRadius * 0.3);
  const eps = plateBoundaryEpsilonMm(envelope.layerHeightMm);
  const lowest = meshLowestBuildAxisMm(mesh);
  assert.ok(lowest >= -eps, `blob resting on the plate meshed to ${lowest.toFixed(4)}mm, past the ${eps}mm tolerance`);
  assert.ok(countPlateContactVertices(mesh, envelope.layerHeightMm) > 0, "expected a real flat face in the plate plane");
});

test("§4 mesh-2 & mesh-3: every default coin candidate's saved mesh sits at the plate, with material touching it", () => {
  for (const hostId of O2_HOSTS) {
    const r = o2Runs.get(hostId)!;
    const eps = plateBoundaryEpsilonMm(r.envelope.layerHeightMm);
    const mesh = buildCandidateMesh(r, 64, r.params.unitRadius * 0.3);
    const lowest = meshLowestBuildAxisMm(mesh);
    assert.ok(lowest >= -eps, `${hostId}: saved mesh dips to ${lowest.toFixed(4)}mm, past the ${eps}mm tolerance`);
    assert.ok(
      countPlateContactVertices(mesh, r.envelope.layerHeightMm) > 0,
      `${hostId}: no vertex lies in the plate plane — a clip that merely removed material would pass mesh-2 but leave no bottom face`,
    );
  }
});

test("§4 mesh-4: clipping at the plate does not break watertightness, winding or the single-component gate", () => {
  const preset = findPrinterPreset("bambu-a1-mini");
  for (const hostId of O2_HOSTS) {
    const r = o2Runs.get(hostId)!;
    const mesh = buildCandidateMesh(r, 64, r.params.unitRadius * 0.3);
    const gate = evaluateSaveGate(mesh, preset.buildVolumeMm, r.envelope.layerHeightMm);
    assert.equal(gate.topology.connectedComponents, 1, `${hostId}: components`);
    assert.equal(gate.topology.openEdges, 0, `${hostId}: open edges`);
    assert.equal(gate.topology.nonManifoldEdges, 0, `${hostId}: non-manifold edges`);
    assert.equal(gate.topology.degenerateTriangleCount, 0, `${hostId}: degenerate triangles`);
    assert.equal(gate.topology.windingConsistent, true, `${hostId}: winding`);
    assert.equal(gate.ok, true, `${hostId}: save gate — ${gate.reasons.join(" / ")}`);
  }
});

test("§4 mesh-5: a synthetic mesh deliberately poked below the plate FAILS the save gate", () => {
  const layerHeightMm = 0.2;
  const eps = plateBoundaryEpsilonMm(layerHeightMm);
  assert.ok(Math.abs(eps - 0.05) < 1e-12, `epsilon should be min(layerHeight/4, 0.05) = 0.05, got ${eps}`);
  // A single triangle whose lowest build-axis coordinate we control directly.
  const triAt = (lowestMm: number) => {
    const bounds = { min: { x: 0, y: lowestMm, z: 0 }, max: { x: 1, y: 1, z: 1 }, size: { x: 1, y: 1 - lowestMm, z: 1 }, longest: 1 };
    return {
      triangles: [{ a: { x: 0, y: lowestMm, z: 0 }, b: { x: 1, y: lowestMm, z: 0 }, c: { x: 0, y: 1, z: 0 } }],
      scaleMmPerUnit: 1,
      mmBounds: bounds,
      sourceBounds: bounds,
    } as unknown as Parameters<typeof evaluateSaveGate>[0];
  };
  const belowReason = (lowestMm: number) =>
    evaluateSaveGate(triAt(lowestMm), { x: 1000, y: 1000, z: 1000 }, layerHeightMm).reasons.filter((x) => x.includes("build plate平面"));
  assert.equal(belowReason(0).length, 0, "exactly at the plate must not be flagged");
  assert.equal(belowReason(-0.049).length, 0, "inside the discretisation tolerance must not be flagged");
  assert.equal(belowReason(-0.051).length, 1, "just past the tolerance must be flagged");
  assert.equal(belowReason(-0.5).length, 1, "clearly below the plate must be flagged");
  assert.equal(evaluateSaveGate(triAt(-0.5), { x: 1000, y: 1000, z: 1000 }, layerHeightMm).ok, false);
});

test("§4 mesh-6: the half-space is oriented correctly for build axis x, y and z", () => {
  const params = baseParams({ targetSurfaceCoverage: 0.25 });
  const preset = findPrinterPreset("bambu-a1-mini");
  for (const axisKey of ["x", "y", "z"] as const) {
    const buildAxis = { x: axisKey === "x" ? 1 : 0, y: axisKey === "y" ? 1 : 0, z: axisKey === "z" ? 1 : 0 };
    const envelope = completeEnvelope({ buildAxis });
    const fit = fitHostToBuildVolume("box", buildAxis, preset.buildVolumeMm);
    const r = growNetwork("box", envelope, params, "coin-constrained", fit.scaleMmPerUnit);
    assert.ok(r.units.length > 0, `${axisKey}: expected growth`);
    const mesh = buildCandidateMesh(r, 48, params.unitRadius * 0.3);
    const eps = plateBoundaryEpsilonMm(envelope.layerHeightMm);
    const lowest = meshLowestBuildAxisMm(mesh);
    assert.ok(lowest >= -eps, `build axis ${axisKey}: saved mesh dips to ${lowest.toFixed(4)}mm — half-space likely oriented wrong`);
    assert.ok(countPlateContactVertices(mesh, envelope.layerHeightMm) > 0, `build axis ${axisKey}: no material in the plate plane`);
  }
});

// === Library: src/lib/hash.ts（R2 最初の昇格） ==========================
// (Optimizer/docs/sonnet-instruction-20260726-katachi-r1-r2-library-first-
// extraction.md §5.1。期待値は標準 SHA-256 の既知値を直書きする —
// 同じ実装で期待値を作ると、実装が壊れてもテストが一緒に壊れて気づけない。)

await testAsync("§5.1 lib/hash: 空入力の SHA-256 が既知値と一致する", async () => {
  // 空文字列 / 空バイト列の SHA-256 は広く公開された既知値。
  const expected = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  assert.equal(await sha256Hex(new ArrayBuffer(0)), expected);
  assert.equal(await sha256Hex(""), expected);
});

await testAsync("§5.1 lib/hash: UTF-8 \"abc\" が既知値と一致する", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

await testAsync("§5.1 lib/hash: 非ASCII文字列がUTF-8として固定される", async () => {
  // "日本語" は UTF-8 で e6 97 a5 e6 9c ac e8 aa 9e の9バイト。
  // 文字列経路とバイト列経路が同じ値を返すことで、TextEncoder が UTF-8 で
  // あること（＝別のエンコーディングへ勝手に変わっていないこと）を固定する。
  const utf8 = new Uint8Array([0xe6, 0x97, 0xa5, 0xe6, 0x9c, 0xac, 0xe8, 0xaa, 0x9e]);
  const viaBytes = await sha256Hex(utf8.buffer as ArrayBuffer);
  const viaString = await sha256Hex("日本語");
  assert.equal(viaString, viaBytes, "文字列経路は UTF-8 バイト列と同じ hash でなければならない");
  assert.equal(viaString.length, 64);
});

await testAsync("§5.1 lib/hash: 0x00 を含む binary bytes を扱える", async () => {
  // 0x00 で途中打ち切りする実装（C文字列的な扱い）でないことを確かめる。
  const withNul = new Uint8Array([0x00, 0x01, 0x00, 0xff]);
  const truncated = new Uint8Array([0x00]);
  const a = await sha256Hex(withNul.buffer as ArrayBuffer);
  const b = await sha256Hex(truncated.buffer as ArrayBuffer);
  assert.notEqual(a, b, "0x00 以降が無視されていないこと");
  assert.equal(a.length, 64);
});

await testAsync("§5.1 lib/hash: 同じ入力は同じ hash、出力は lowercase 64 文字 hex", async () => {
  const bytes = new TextEncoder().encode("katachi-library-promotion").buffer as ArrayBuffer;
  const a = await sha256Hex(bytes);
  const b = await sha256Hex(bytes);
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.match(a, /^[0-9a-f]{64}$/, "lowercase hex 64文字であること（大文字が混ざらない）");
});

await testAsync("§5.1 lib/hash: interior-growth の旧 import path が Library と同一の実装を指す", async () => {
  // meshExport.ts の再export が壊れていないこと（growth.test.ts 自身が
  // "./meshExport.ts" から sha256Hex を取り込んでいる）。
  const bytes = new TextEncoder().encode("re-export path").buffer as ArrayBuffer;
  assert.equal(await sha256Hex(bytes), await libSha256Hex(bytes));
});

// === R3: savedFrame（保存座標系の来歴） ==================================
// (Optimizer/docs/sonnet-instruction-20260726-katachi-r3-saved-frame-
// provenance.md §6。geometry は一切動かさないので、STL bytes/hash が
// 変わらないことも併せて固定する。)

/** 保存 mesh を1つ作る小さなヘルパ。axis ごとに実際に育てて mesh 化する。 */
function savedMeshFor(axisKey: "x" | "y" | "z") {
  const buildAxis = { x: axisKey === "x" ? 1 : 0, y: axisKey === "y" ? 1 : 0, z: axisKey === "z" ? 1 : 0 };
  const envelope = completeEnvelope({ buildAxis });
  const preset = findPrinterPreset("bambu-a1-mini");
  const fit = fitHostToBuildVolume("box", buildAxis, preset.buildVolumeMm);
  const params = baseParams({ targetSurfaceCoverage: 0.25 });
  const result = growNetwork("box", envelope, params, "coin-constrained", fit.scaleMmPerUnit);
  const mesh = buildCandidateMesh(result, 48, params.unitRadius * 0.3);
  return { result, mesh, envelope, fit, buildAxis };
}

test("§6-1: upAxis が +X / +Y / +Z で正しい", () => {
  for (const axisKey of ["x", "y", "z"] as const) {
    const { mesh } = savedMeshFor(axisKey);
    const frame = deriveSavedFrame(mesh);
    assert.equal(frame.upAxis.axis, axisKey, `${axisKey}: upAxis.axis`);
    assert.equal(frame.upAxis.sign, 1, `${axisKey}: UI が作るのは正方向のみ`);
    assert.equal(frame.coordinateUnit, "mm");
    assert.equal(frame.platePlane.axis, axisKey, `${axisKey}: platePlane は同じ軸`);
  }
});

test("§6-2: plate 座標が host と scale から導出される（定数ではない）", () => {
  for (const axisKey of ["x", "y", "z"] as const) {
    const { mesh } = savedMeshFor(axisKey);
    const frame = deriveSavedFrame(mesh);
    const ref = mesh.plateReference!;
    // 期待値は plateReference と scale から独立に組み立てる。
    const expected = ref.sign * ref.plateOffsetFieldUnits * mesh.scaleMmPerUnit;
    assert.ok(Math.abs(frame.platePlane.coordinateMm - expected) < 1e-9, `${axisKey}: ${frame.platePlane.coordinateMm} vs ${expected}`);
    // sign の二重適用が無いこと: 生の mesh 頂点の最小値と一致する軸座標であること。
    let minCoord = Infinity;
    for (const t of mesh.triangles) for (const v of [t.a, t.b, t.c]) {
      const c = Math.fround(v[axisKey] * mesh.scaleMmPerUnit);
      if (c < minCoord) minCoord = c;
    }
    assert.ok(minCoord >= frame.platePlane.coordinateMm - 1e-3, `${axisKey}: plate より下に頂点がある（${minCoord} < ${frame.platePlane.coordinateMm}）`);
  }
});

test("§6-3: 既定 +Y fixture の plate が実測位置（約 -81mm）にある", () => {
  const { mesh, fit } = savedMeshFor("y");
  const frame = deriveSavedFrame(mesh);
  // fixture 非依存: host の plate offset と canonical scale から期待値を組む。
  const expected = buildPlateOffset("box", { x: 0, y: 1, z: 0 }) * fit.scaleMmPerUnit;
  assert.ok(Math.abs(frame.platePlane.coordinateMm - expected) < 1e-9, `${frame.platePlane.coordinateMm} vs ${expected}`);
  // そのうえで、既定条件では実際に -81mm 付近になることを実測として残す。
  assert.ok(frame.platePlane.coordinateMm < -80 && frame.platePlane.coordinateMm > -82, `既定 A1 mini/box では -81mm 付近のはず: ${frame.platePlane.coordinateMm}`);
});

test("§6-4 & §6-5: 記録された回転で up が +Z へ、平行移動で plate が z=0 へ", () => {
  for (const axisKey of ["x", "y", "z"] as const) {
    const { mesh } = savedMeshFor(axisKey);
    const frame = deriveSavedFrame(mesh);
    const d = frame.toPrintReady.directionToPositiveZ;
    // §6-4: directionToPositiveZ は単位ベクトルで、up 軸そのものを指す。
    assert.ok(Math.abs(Math.hypot(d[0], d[1], d[2]) - 1) < 1e-12, `${axisKey}: 単位ベクトルでない`);
    const idx = axisKey === "x" ? 0 : axisKey === "y" ? 1 : 2;
    assert.equal(d[idx], frame.upAxis.sign, `${axisKey}: up 軸成分が sign と一致しない`);
    assert.equal(d.filter((v) => v !== 0).length, 1, `${axisKey}: cardinal 方向でない`);

    // §6-5: この方向を +Z へ移す回転をかけた後、plate の z は
    // 「符号付き軸に沿った plate 座標」になる。平行移動はそれを 0 にするもの。
    const ref = mesh.plateReference!;
    const plateAlongAxisMm = ref.plateOffsetFieldUnits * mesh.scaleMmPerUnit;
    const t = frame.toPrintReady.translationAfterRotationMm;
    assert.equal(t[0], 0, `${axisKey}: 平行移動は z のみ`);
    assert.equal(t[1], 0, `${axisKey}: 平行移動は z のみ`);
    assert.ok(Math.abs(plateAlongAxisMm + t[2]) < 1e-9, `${axisKey}: 回転後 plate が z=0 にならない（${plateAlongAxisMm} + ${t[2]}）`);
  }
});

test("§6-6: applied は必ず false（記述であって適用ではない）", () => {
  for (const axisKey of ["x", "y", "z"] as const) {
    assert.equal(deriveSavedFrame(savedMeshFor(axisKey).mesh).toPrintReady.applied, false);
  }
});

await testAsync("§6-7: savedFrame を作っても STL bytes と SHA-256 が変わらない", async () => {
  const { result, mesh, fit } = savedMeshFor("y");
  const before = encodeBinaryStl(mesh, "r3-invariance");
  const beforeHash = await sha256Hex(before);
  // provenance を作る（savedFrame の導出を含む）
  const preset = findPrinterPreset("bambu-a1-mini");
  const prov = buildProvenance(result, mesh, fit, preset, 48, result.params.unitRadius * 0.3,
    evaluateSaveGate(mesh, preset.buildVolumeMm, result.envelope.layerHeightMm).topology, false);
  assert.ok(prov.savedFrame, "savedFrame が provenance に入っていること");
  const after = encodeBinaryStl(mesh, "r3-invariance");
  const afterHash = await sha256Hex(after);
  assert.equal(before.byteLength, after.byteLength, "bytes 長が変わった");
  assert.equal(beforeHash, afterHash, "STL の SHA-256 が変わった — geometry を触っている");
  // §4 の他の不変条件も同時に固定する。
  assert.equal(prov.savedLowestBuildAxisMm, meshLowestBuildAxisMm(mesh));
  assert.equal(prov.savedPlateContactVertexCount, countPlateContactVertices(mesh, result.envelope.layerHeightMm));
});

await testAsync("P2.6 C1: shared orientation の省略時出力を固定 SHA-256 で監視する", async () => {
  const { mesh } = savedMeshFor("y");
  const header = "p2.6-default-orientation-golden";
  const defaultBytes = encodeBinaryStl(mesh, header);
  assert.equal(
    await sha256Hex(defaultBytes),
    "df21e364535605da6e0ad13b502a1b2bee9f70323c53c09749e89fac2cb0c794",
    "既存 positive-all save path の STL bytes が変わった",
  );
});

test("§6-8: legacy recipe から復元した結果でも savedFrame が生成される", () => {
  const { result, mesh, fit } = savedMeshFor("y");
  // O2 より前の形へ落として migration を通す（history.ts の構造検出）。
  const legacy = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
  delete legacy.algorithmVersion;
  delete legacy.launchPointCount;
  const text = serializeRecipe([{ t: 1, op: "generateCandidates", args: { results: [legacy] } } as unknown as HistoryEntry]);
  const { entries, legacyMigrated } = parseRecipe(text);
  assert.equal(legacyMigrated, true);
  const restored = replay(entries).results[0];
  const preset = findPrinterPreset("bambu-a1-mini");
  const prov = buildProvenance(restored, mesh, fit, preset, 48, restored.params.unitRadius * 0.3,
    evaluateSaveGate(mesh, preset.buildVolumeMm, restored.envelope.layerHeightMm).topology, true);
  // savedFrame は保存時に mesh から導出するので、古い result でも欠けない。
  assert.equal(prov.savedFrame.coordinateUnit, "mm");
  assert.equal(prov.savedFrame.upAxis.axis, "y");
  assert.equal(prov.savedFrame.toPrintReady.applied, false);
});

test("§6-9: savedFrame が JSON round-trip で値を保つ", () => {
  const { mesh } = savedMeshFor("y");
  const frame = deriveSavedFrame(mesh);
  const back = JSON.parse(JSON.stringify(frame)) as typeof frame;
  assert.deepEqual(back, frame);
  // 配列が配列のまま（オブジェクト化されていない）こと。
  assert.ok(Array.isArray(back.toPrintReady.directionToPositiveZ));
  assert.ok(Array.isArray(back.toPrintReady.translationAfterRotationMm));
  assert.equal(back.toPrintReady.directionToPositiveZ.length, 3);
});

test("R3: Katachi の平行移動が Optimizer の定義と一致する条件を固定する", () => {
  // Optimizer orient は「mesh の最小Z」を z=0 へ送る。Katachi は「plate 面」を
  // z=0 へ送る。両者が同じ数になるのは mesh の最下点が plate に接するときだけ。
  // ここではその一致条件が既定 fixture で実際に成り立っていることを実測し、
  // 「常に一致する」ではなく「この条件で一致する」として固定する。
  for (const axisKey of ["x", "y", "z"] as const) {
    const { mesh, result } = savedMeshFor(axisKey);
    const frame = deriveSavedFrame(mesh);
    const contact = countPlateContactVertices(mesh, result.envelope.layerHeightMm);
    assert.ok(contact > 0, `${axisKey}: plate 接触頂点が無い — 一致条件が成り立たない`);

    // 回転後の「mesh 最小Z」= 符号付き軸に沿った mesh 最小座標
    let minAlongAxis = Infinity;
    for (const t of mesh.triangles) for (const v of [t.a, t.b, t.c]) {
      const c = frame.upAxis.sign * Math.fround(v[axisKey] * mesh.scaleMmPerUnit);
      if (c < minAlongAxis) minAlongAxis = c;
    }
    const optimizerWouldTranslate = -minAlongAxis;      // mesh最小 → z=0
    const katachiTranslates = frame.toPrintReady.translationAfterRotationMm[2]; // plate → z=0

    // plate clip があるので接触時は一致する。許容差は plate 境界の epsilon。
    const eps = plateBoundaryEpsilonMm(result.envelope.layerHeightMm);
    assert.ok(
      Math.abs(optimizerWouldTranslate - katachiTranslates) <= eps,
      `${axisKey}: 接触しているのに一致しない（Optimizer ${optimizerWouldTranslate} vs Katachi ${katachiTranslates}）`,
    );
  }
});

test("R3補正: plateReference の無い mesh では savedFrame を推測せず失敗する（fail closed）", () => {
  const { result, mesh, fit } = savedMeshFor("y");
  const preset = findPrinterPreset("bambu-a1-mini");
  const blendK = result.params.unitRadius * 0.3;
  const topology = evaluateSaveGate(mesh, preset.buildVolumeMm, result.envelope.layerHeightMm).topology;

  // 正常な mesh を複製し、plateReference だけを取り除く。
  const stripped = { ...mesh } as typeof mesh;
  delete (stripped as { plateReference?: unknown }).plateReference;

  // 初版はここで +Y / plate=0 という根拠の無い値を返していた。
  // plateReference が無いのに savedFrame を返してはいけない。
  // 型shim の assert.throws は matcher を取らないので、理由まで手で確かめる。
  const expectReason = (fn: () => unknown, what: string) => {
    let message: string | null = null;
    try {
      fn();
    } catch (err) {
      message = (err as Error).message;
    }
    assert.ok(message !== null, `${what}: 失敗するはずが値を返した`);
    assert.ok(message!.includes("plateReference"), `${what}: 理由が plateReference 欠落だと分からない — "${message}"`);
  };
  expectReason(() => deriveSavedFrame(stripped), "deriveSavedFrame");

  // buildProvenance も握りつぶさず、savedFrame 欠落のまま
  // もっともらしい provenance を書き出さないこと。
  // savedFrame を導けないのに provenance を返してはいけない
  expectReason(() => buildProvenance(result, stripped, fit, preset, 48, blendK, topology, false), "buildProvenance");

  // 正常系は影響を受けない（同じ引数で plateReference 付きなら通る）。
  const ok = buildProvenance(result, mesh, fit, preset, 48, blendK, topology, false);
  assert.equal(ok.savedFrame.upAxis.axis, "y");
  assert.equal(ok.savedFrame.toPrintReady.applied, false);
});

// === P2.3 §6.1: fix the ring-fusion DIAGNOSIS (no production behavior changed) ===
//
// These pin down the measurement itself, so the P2.3 Observation in README.md
// cannot silently drift. They deliberately do NOT assert that the saved mesh is
// one component — it is not, and the save gate correctly refuses it. What they
// assert is that the diagnosis keeps saying the same thing about WHY.
//
// Cost: the headline diagnosis runs at resolution 64 with both EXACT stages
// (~70s for box alone). These tests use ONE host, the INDEXED stages and a
// coarser resolution, and reuse a single grown result. Where a number differs
// from the headline table because of that, the difference is stated.

const P23_RESOLUTION = 40; // coarser than the production 64 on purpose — see above
const p23Conditions = o2Conditions("waisted");
const p23Result = growNetwork(
  "waisted",
  p23Conditions.envelope,
  p23Conditions.params,
  "ring-constrained",
  p23Conditions.fit.scaleMmPerUnit,
);
const p23BlendK = p23Result.params.unitRadius * 0.3;

test("P2.3-1: the diagnosis is deterministic for a fixed seed", () => {
  const a = diagnoseCandidate(p23Result, {
    resolution: P23_RESOLUTION,
    blendK: p23BlendK,
    gapSamplesPerSegment: 17,
    includeExactStages: false,
  });
  const b = diagnoseCandidate(p23Result, {
    resolution: P23_RESOLUTION,
    blendK: p23BlendK,
    gapSamplesPerSegment: 17,
    includeExactStages: false,
  });
  assert.equal(diagnosisFingerprint(a), diagnosisFingerprint(b));
  // And a re-grown result from the same seed diagnoses identically.
  const again = growNetwork(
    "waisted",
    p23Conditions.envelope,
    p23Conditions.params,
    "ring-constrained",
    p23Conditions.fit.scaleMmPerUnit,
  );
  assert.equal(
    diagnosisFingerprint(
      diagnoseCandidate(again, { resolution: P23_RESOLUTION, blendK: p23BlendK, gapSamplesPerSegment: 17, includeExactStages: false }),
    ),
    diagnosisFingerprint(a),
  );
});

test("P2.3-2: ONE ring unit's pre-clip field is a single component, and stays one after the plate clip", () => {
  const ring = p23Result.units.find((u) => u.kind === "ring" && u.points.length > 2 && u.parentId !== null);
  assert.ok(ring, "expected a multi-node child ring");
  const s = measureSubsetComponents(p23Result, [ring!], 48, p23BlendK, p23Conditions.envelope.layerHeightMm);
  // The ring material model itself is NOT the defect: measured 1 both sides.
  assert.equal(s.preClipComponentCount, 1, "a single ring must be one piece pre-clip");
  assert.equal(s.postClipComponentCount, 1, "the plate clip must not split a single ring");
});

test("P2.3-3: pre-clip and post-clip are distinguishable — the clip really does remove material below the plate", () => {
  const root = p23Result.units.find((u) => u.parentId === null)!;
  const s = measureSubsetComponents(p23Result, [root], 48, p23BlendK, p23Conditions.envelope.layerHeightMm);
  // If a refactor ever swapped the two fields, this would fail: the post-clip
  // mesh cannot reach below the plate, and the root's own pre-clip mesh does.
  assert.ok(s.preClipAxisMinMm !== null && s.postClipAxisMinMm !== null);
  assert.ok(
    s.postClipAxisMinMm! >= -plateBoundaryEpsilonMm(p23Conditions.envelope.layerHeightMm),
    `post-clip must not sit below the plate, got ${s.postClipAxisMinMm}mm`,
  );
  assert.ok(
    s.preClipAxisMinMm! <= s.postClipAxisMinMm!,
    `pre-clip must reach at least as low as post-clip (pre ${s.preClipAxisMinMm}, post ${s.postClipAxisMinMm})`,
  );
  assert.ok(s.postClipTriangleCount <= s.preClipTriangleCount, "clipping cannot add triangles");
});

test("P2.3-4: a parent-child capsule gap is a finite number, and the neck state distinguishes containment from separation", () => {
  const child = p23Result.units.find((u) => u.parentId !== null && u.kind === "ring")!;
  const parent = p23Result.units.find((u) => u.id === child.parentId)!;
  const buildAxis = vNorm(p23Conditions.envelope.buildAxis);
  const g = measureCapsulePairGap(
    child,
    parent,
    17,
    buildAxis,
    buildPlateOffset(p23Result.hostId, buildAxis),
    p23Result.canonicalScaleMmPerUnit,
  );
  assert.ok(Number.isFinite(g.sampledMinSignedGapFieldUnits), "the sampled gap must be finite");
  assert.ok(Number.isFinite(g.sampledMinSignedGapMm));
  assert.ok(g.samplingErrorBoundFieldUnits >= 0, "the sampling error bound is reported, never negative");
  // The neck proxy must never report 0 for deep containment — that reading made
  // full material merging look like a zero-width neck.
  if (g.neckState === "contained" || g.neckState === "separated") {
    assert.equal(g.neckRadiusProxyFieldUnits, null, `${g.neckState} has no intersection circle, so the radius must be null, not 0`);
  } else {
    assert.ok(g.neckRadiusProxyFieldUnits !== null && g.neckRadiusProxyFieldUnits > 0, "a lens neck has a positive radius");
  }
  // A negative gap means overlapping material, so it can never be "separated".
  if (g.sampledMinSignedGapFieldUnits < 0) assert.notEqual(g.neckState, "separated");
});

test("P2.3-5: the exact and indexed unions agree on which side of the isosurface a point is, wherever the field is near zero", () => {
  const iso = compareIsosurfaceClassification(p23Result, p23BlendK, 24);
  assert.ok(iso.compared > 1000, `expected a meaningful sample, got ${iso.compared}`);
  // Disagreements are permitted only on the knife edge. `SAMPLER_TOLERANCE`
  // (0.01) is the already-measured bound this Study fixed for the two forms.
  assert.ok(
    iso.maxAbsExactAtDisagreement <= SAMPLER_TOLERANCE,
    `exact/indexed disagreed where the exact field was ${iso.maxAbsExactAtDisagreement} from zero, beyond the ${SAMPLER_TOLERANCE} knife edge`,
  );
});

// --- P2.3 CORRECTION ROUND (2026-07-27) -------------------------------------
//
// The previous P2.3-6 was named "the detached pieces are material the smooth
// BLEND creates, not any unit's own material" and asserted that <25% of the
// piece's SURFACE VERTICES are inside the hard union. An independent audit
// found that assertion cannot support that name: `smoothMin(a,b,k) <= min(a,b)`
// makes the smooth isosurface lie outside the hard union no matter how much
// hard material a component contains, so the surface-vertex fraction is near
// zero for a hard-packed component too (proven by the synthetic fixture in
// P2.3-8/9 below). The test is replaced by one named for what it actually
// measures; the verdict it used to imply is measured separately, by volume.

/** The production mesh of the P2.3 fixture, built once (it is the input to several corrections below). */
const p23Mesh = buildCandidateMesh(p23Result, P23_RESOLUTION, p23BlendK);
const p23Report = measureComponents(
  p23Mesh.triangles,
  p23Mesh.scaleMmPerUnit,
  p23Mesh.plateReference!,
  p23Conditions.envelope.layerHeightMm,
);

test("P2.3-6: every non-largest component's SMOOTH surface vertices lie outside the HARD union — a statement about the surface only, never about the volume", () => {
  assert.ok(p23Report.componentCount > 1, "this fixture is the known multi-component case; if it becomes 1, re-measure and rewrite this test");
  // What is measured: the fraction of each non-largest component's own vertices
  // at which `unitsPointsSdf(units, 1e-9, …) <= 0`. What it does NOT measure:
  // how much hard material lies INSIDE that component — see P2.3-9, which is
  // the volumetric test, and P2.3-8, which shows this criterion misclassifying.
  for (const c of p23Report.components.slice(1)) {
    const tris = componentTriangles(p23Mesh.triangles, p23Report, c.rank);
    let insideHardUnion = 0;
    let vertices = 0;
    let minHard = Infinity;
    for (const t of tris) {
      for (const v of [t.a, t.b, t.c]) {
        const hard = unitsPointsSdf(p23Result.units, 1e-9, v.x, v.y, v.z);
        if (hard <= 0) insideHardUnion++;
        if (hard < minHard) minHard = hard;
        vertices++;
      }
    }
    assert.ok(vertices > 0, `component ${c.rank} has no vertices`);
    const fraction = insideHardUnion / vertices;
    assert.ok(
      fraction < 0.25,
      `component ${c.rank}: ${(fraction * 100).toFixed(1)}% of its surface vertices were inside the hard union (min hard SDF ${minHard})`,
    );
  }
});

test("P2.3-7: the smooth union never rises above the hard union, which is WHY a surface-vertex test cannot see hard material inside a component", () => {
  const ordering = measureSmoothVsHardOrdering(p23Result, p23BlendK, 20);
  assert.ok(ordering.compared > 1000, `expected a meaningful sample, got ${ordering.compared}`);
  // `smoothMin(a,b,k) <= Math.min(a,b)` for every k >= 0, and the union is the
  // same left fold in both forms — so the blended field is <= the hard field
  // everywhere. A vertex where blended = 0 therefore has hard >= 0: the smooth
  // surface can never be strictly inside the hard union. Measured, not assumed.
  assert.equal(
    ordering.blendedAboveHardCount,
    0,
    `the blended field exceeded the hard field at ${ordering.blendedAboveHardCount} sample points (max excess ${ordering.maxBlendedMinusHard}) — the ordering the P2.3 correction rests on would be broken`,
  );
  assert.ok(ordering.maxBlendedMinusHard <= 0);
  // And the gap is not a rounding artefact: the blend pushes the isosurface a
  // real distance outside the hard surface. THAT distance is what the old
  // criterion mistook for evidence of "no unit material".
  assert.ok(
    ordering.maxHardMinusBlended > 0,
    "expected the blend to push the field below the hard union somewhere; if it never does, this fixture is no longer a blended candidate",
  );
});

// --- synthetic fixtures: does the instrument itself work? --------------------
//
// Hand-made, not grown: the point is to know the right answer in advance.

/** A GrowthUnit made of raw spheres (`kind: "coin"` — `unitFieldElements` decomposes it to one sphere element per point, so the hard union of this unit IS the union of these spheres). */
function sphereUnit(id: number, points: Array<{ x: number; y: number; z: number; r: number }>): GrowthUnit {
  return {
    id,
    kind: "coin",
    points,
    parentId: id === 0 ? null : 0,
    generation: id,
    supportContact: "build-plate",
    role: "base",
    heading: { x: 0, y: 1, z: 0 },
    verticalStepField: 0,
    lateralStepField: 0,
  };
}

/** A closed 12-triangle cube shell with OUTWARD-facing winding (verified by P2.3-11: its signed volume is +side³). */
function cubeShell(cx: number, cy: number, cz: number, halfSize: number): Triangle[] {
  const v = (dx: number, dy: number, dz: number) => ({ x: cx + dx * halfSize, y: cy + dy * halfSize, z: cz + dz * halfSize });
  const p = [v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1), v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)];
  // Wound so the signed tetrahedron sum comes out POSITIVE (outward normals).
  const quad = (i: number, j: number, k: number, l: number) => [
    { a: p[i], b: p[k], c: p[j] },
    { a: p[i], b: p[l], c: p[k] },
  ];
  return [...quad(0, 1, 2, 3), ...quad(4, 7, 6, 5), ...quad(0, 4, 5, 1), ...quad(1, 5, 6, 2), ...quad(2, 6, 7, 3), ...quad(3, 7, 4, 0)];
}

function reversedWinding(triangles: Triangle[]): Triangle[] {
  return triangles.map((t) => ({ a: t.a, b: t.c, c: t.b }));
}

// The fixture: a 3-sphere rod (rank 0) and, far enough away not to interact
// with it through the blend, a 2-sphere PAIR fused by a large blendK (rank 1).
// The pair provably contains hard material — two whole spheres of radius 0.6 —
// and its blended surface bulges outside the hard union everywhere.
const FIXTURE_BLEND_K = 2.0;
const FIXTURE_UNITS: GrowthUnit[] = [
  sphereUnit(0, [
    { x: -6, y: 0, z: 0, r: 0.9 },
    { x: -5.1, y: 0, z: 0, r: 0.9 },
    { x: -4.2, y: 0, z: 0, r: 0.9 },
  ]),
  sphereUnit(1, [
    { x: 5.3, y: 0, z: 0, r: 0.6 },
    { x: 6.7, y: 0, z: 0, r: 0.6 },
  ]),
];
const FIXTURE_PLATE_REFERENCE = { axis: "y" as const, sign: 1 as const, plateOffsetFieldUnits: 0 };
const FIXTURE_BOUNDS = {
  min: { x: -8, y: -1.2, z: -1.2 },
  max: { x: 8, y: 1.2, z: 1.2 },
  size: { x: 16, y: 2.4, z: 2.4 },
  longest: 16,
};
/** Meshed at scale 1, so field units ARE millimetres here and every number below can be checked by hand. */
const fixtureMesh = rescaleMeshResult(
  buildMeshFromField(FIXTURE_BOUNDS, (x, y, z) => unitsPointsSdf(FIXTURE_UNITS, FIXTURE_BLEND_K, x, y, z), {
    resolution: 128,
    targetLongestMm: 1,
  }),
  1,
);
const fixtureReport = measureComponents(fixtureMesh.triangles, 1, FIXTURE_PLATE_REFERENCE, 0.2);
/** Grid densities every volumetric measurement below is run at. Two, so a verdict that flips with resolution is visible instead of quoted. */
const FIXTURE_DENSITIES = [16, 26] as const;
const fixturePairOverlap = measureComponentHardOverlap(
  componentTriangles(fixtureMesh.triangles, fixtureReport, 1),
  1,
  FIXTURE_UNITS,
  1,
  FIXTURE_DENSITIES,
  FIXTURE_PLATE_REFERENCE,
);

test("P2.3-8 (REGRESSION EXHIBIT): the OLD surface-vertex criterion calls a component that is full of hard material 'blend-only'", () => {
  assert.equal(fixtureReport.componentCount, 2, "the fixture must be two components: the rod and the fused sphere pair");
  assert.ok(fixturePairOverlap.surface.closed, "the component under test must be a closed surface before any of this is measurable");
  assert.ok(fixturePairOverlap.surface.windingConsistent);
  // The old criterion, applied verbatim (the replaced P2.3-6 accepted anything
  // under 25% as "not any unit's own material").
  assert.ok(
    fixturePairOverlap.surfaceVertexInsideFraction < 0.25,
    `the old criterion would have to fire for this to be a regression exhibit, but it measured ${(fixturePairOverlap.surfaceVertexInsideFraction * 100).toFixed(2)}%`,
  );
  // Stronger: NOT ONE of its surface vertices is inside the hard union.
  assert.equal(fixturePairOverlap.surfaceVerticesInsideHardUnion, 0);
  assert.ok(
    fixturePairOverlap.minHardSdfAtSurfaceVertex > 0,
    `even the most deeply-placed surface vertex is outside the hard union (min hard SDF ${fixturePairOverlap.minHardSdfAtSurfaceVertex})`,
  );
  // And yet: the component demonstrably contains two whole spheres. Checked
  // here directly, independently of the volumetric instrument, so this test
  // stands on its own if that instrument is ever wrong.
  for (const p of FIXTURE_UNITS[1].points) {
    assert.ok(hardUnionSdf(FIXTURE_UNITS, p.x, p.y, p.z) < 0, "a sphere centre must be inside the hard union");
    assert.ok(
      unitsPointsSdf(FIXTURE_UNITS, FIXTURE_BLEND_K, p.x, p.y, p.z) < 0,
      "and inside the smooth shape whose component this is",
    );
  }
});

test("P2.3-9: the VOLUMETRIC measurement finds the hard material the surface-vertex criterion missed, at both grid densities", () => {
  assert.equal(fixturePairOverlap.grids.length, 2, "two densities, so a non-converged verdict is visible");
  for (const g of fixturePairOverlap.grids) {
    assert.ok(g.insideCells > 0, `density ${g.samplesPerLongestEdge}: no cell was found inside the component`);
    assert.ok(
      g.hardNegativeInsideCells > 0,
      `density ${g.samplesPerLongestEdge}: found no hard material inside a component that provably contains two spheres`,
    );
    assert.ok(g.hardNegativeInsideVolumeMm3 > 0);
    assert.ok(g.minHardSdfInside !== null && g.minHardSdfInside < 0);
    // The epsilon band is held OUT of the verdict, never folded into either side.
    assert.equal(
      g.hardNegativeInsideCells + g.hardPositiveInsideCells + g.ambiguousInsideCells,
      g.insideCells,
      "every inside cell must be in exactly one of the three tallies",
    );
  }
  assert.ok(fixturePairOverlap.hardNegativeAtEveryDensity);
  assert.equal(fixturePairOverlap.hardNegativeAtNoDensity, false);
  assert.ok(fixturePairOverlap.densitiesAgree, "the two densities must agree for this verdict to be quotable at all");
  // The hard volume it finds is a LOWER bound on the true 2 × (4/3)π0.6³ =
  // 1.81mm³, because the ambiguous band around the hard surface is excluded —
  // and it rises toward it as the grid refines. Both are asserted rather than
  // rounded away.
  const [coarse, fine] = fixturePairOverlap.grids;
  assert.ok(coarse.hardNegativeInsideVolumeMm3 < 1.81, "the excluded band means this is a lower bound, never the true volume");
  assert.ok(fine.hardNegativeInsideVolumeMm3 < 1.81);
  assert.ok(
    fine.hardNegativeInsideVolumeMm3 > coarse.hardNegativeInsideVolumeMm3,
    "refining the grid must shrink the excluded band and raise the measured hard volume",
  );
});

test("P2.3-10: a genuine blend-only lobe measures as containing NO hard material at either density", () => {
  // A closed surface around a region that is inside the SMOOTH union (it is
  // material of the saved shape) and outside the HARD union (no unit's own
  // material) — i.e. exactly what "material the blend creates" means. Placed in
  // the bridge between the fixture's two spheres, where that is true by
  // construction; the two assertions below check it rather than assume it.
  const centre = { x: 6, y: 0, z: 0 };
  assert.ok(unitsPointsSdf(FIXTURE_UNITS, FIXTURE_BLEND_K, centre.x, centre.y, centre.z) < 0, "must be inside the smooth shape");
  assert.ok(hardUnionSdf(FIXTURE_UNITS, centre.x, centre.y, centre.z) > 0, "must be outside the hard union");
  const lobe = cubeShell(centre.x, centre.y, centre.z, 0.06);
  const o = measureComponentHardOverlap(lobe, 0, FIXTURE_UNITS, 1, FIXTURE_DENSITIES, FIXTURE_PLATE_REFERENCE);
  assert.ok(o.surface.closed && o.surface.windingConsistent);
  for (const g of o.grids) {
    assert.ok(g.insideCells > 0, "the lobe must contain sampled cells at all");
    assert.equal(g.hardNegativeInsideCells, 0, `density ${g.samplesPerLongestEdge} found hard material inside a blend-only lobe`);
    assert.equal(g.hardPositiveInsideCells, g.insideCells, "every inside cell must be provably outside the hard union");
    assert.equal(g.ambiguousInsideCells, 0);
  }
  assert.ok(o.hardNegativeAtNoDensity);
  assert.ok(o.densitiesAgree);
  // The old criterion returns exactly the same 0% here as it does for P2.3-8's
  // hard-packed component. That identity is the whole regression.
  assert.equal(o.surfaceVertexInsideFraction, 0);
  assert.equal(fixturePairOverlap.surfaceVertexInsideFraction, 0);
});

test("P2.3-11: the signed-volume convention IS establishable before the save orientation step — outward, reversed and cavity wall are three distinguishable cases", () => {
  const outward = cubeShell(0, 0, 0, 1);
  const reversed = reversedWinding(outward);
  const outwardConv = measureSignedVolumeConvention(outward, 1);
  const reversedConv = measureSignedVolumeConvention(reversed, 1);
  assert.ok(outwardConv.closed && outwardConv.windingConsistent);
  assert.equal(outwardConv.signedVolumeProxyMm3, 8, "a 2×2×2 outward cube shell must measure +8mm³");
  assert.equal(reversedConv.signedVolumeProxyMm3, -8, "the same shell reversed must measure -8mm³");
  assert.equal(outwardConv.absoluteVolumeProxyMm3, reversedConv.absoluteVolumeProxyMm3, "|volume| cannot tell them apart — which is why the sign is kept");

  // A cavity: a solid 2×2×2 cube with a 1×1×1 void inside it. The void's wall
  // faces AWAY from the surrounding solid, i.e. inward relative to the void, so
  // its own signed volume is negative and the solid's total is 8 - 1 = 7.
  const cavityWall = reversedWinding(cubeShell(0, 0, 0, 0.5));
  const cavityConv = measureSignedVolumeConvention(cavityWall, 1);
  assert.equal(cavityConv.signedVolumeProxyMm3, -1);
  const solidWithCavity = [...outward, ...cavityWall];
  assert.equal(measureSignedVolumeConvention(solidWithCavity, 1).signedVolumeProxyMm3, 7, "outer shell minus cavity");
  // THE LIMIT, stated rather than hidden: a cavity wall and a reversed shell
  // have the SAME sign. The sign distinguishes orientation, never solid-vs-void
  // — that needs containment, which is what P2.3-9's volumetric test does.
  assert.equal(Math.sign(cavityConv.signedVolumeProxyMm3), Math.sign(reversedConv.signedVolumeProxyMm3));
});

test("P2.3-12: after the SAVE orientation step the sign is forced positive, so it must NOT be read as evidence that a component is solid", () => {
  const outward = cubeShell(0, 0, 0, 1);
  const cavityWall = reversedWinding(cubeShell(0, 0, 0, 0.5));
  const cavityConv = measureSignedVolumeConvention(cavityWall, 1);
  // `orientMeshForSavedStl` (the last step of buildCandidateMesh) flips any
  // component whose signed six-volume is negative. So on a SAVED mesh every
  // component reads positive whatever it is.
  assert.ok(cavityConv.orientationFlippedTheSign, "the orientation step must be what destroys the sign");
  assert.equal(cavityConv.signedVolumeAfterSavedOrientationMm3, 1);
  const orientedSolid = orientMeshForSavedStl({
    triangles: [...outward, ...cavityWall],
    scaleMmPerUnit: 1,
    sourceBounds: FIXTURE_BOUNDS,
    mmBounds: FIXTURE_BOUNDS,
    watertight: { ok: true, openEdges: 0, nonManifoldEdges: 0, totalEdges: 0 },
  });
  const orientedReport = measureComponents(orientedSolid.triangles, 1, FIXTURE_PLATE_REFERENCE, 0.2);
  assert.equal(orientedReport.componentCount, 2);
  for (const c of orientedReport.components) {
    assert.ok(c.signedVolumeProxyMm3 > 0, `component ${c.rank} came out of the save orientation with a non-positive sign`);
  }
  // And the consequence: summing the oriented components gives 8 + 1 = 9, not
  // the solid's actual 7. A "positive volume, therefore solid" reading of a
  // saved mesh is measuring the orientation step, not the shape.
  const sum = orientedReport.components.reduce((s, c) => s + c.signedVolumeProxyMm3, 0);
  assert.equal(sum, 9);
  // The correction itself: ComponentStat now KEEPS the sign, so a pre-orientation
  // mesh's reversed component is still visible as reversed.
  const reversedReport = measureComponents(reversedWinding(outward), 1, FIXTURE_PLATE_REFERENCE, 0.2);
  assert.equal(reversedReport.components[0].signedVolumeProxyMm3, -8);
  assert.equal(reversedReport.components[0].absoluteVolumeProxyMm3, 8);
});

test("P2.3-13: an unchanged component COUNT does not mean unchanged components — the identity matcher detects the substitution", () => {
  // Before: one big piece plus one distant small piece.
  // After: the big piece has been split in two and the small piece deleted.
  // The count is 2 both times; nothing survived unchanged.
  const before = [...cubeShell(0, 0, 0, 2), ...cubeShell(30, 0, 0, 1)];
  const after = [...cubeShell(-3, 0, 0, 1), ...cubeShell(3, 0, 0, 1)];
  const beforeReport = measureComponents(before, 1, FIXTURE_PLATE_REFERENCE, 0.2);
  const afterReport = measureComponents(after, 1, FIXTURE_PLATE_REFERENCE, 0.2);
  assert.equal(beforeReport.componentCount, 2);
  assert.equal(afterReport.componentCount, 2);
  const matching = matchComponentSets(
    componentSignatures(before, beforeReport, 1),
    componentSignatures(after, afterReport, 1),
  );
  assert.equal(matching.countPreserved, true, "this fixture exists precisely because the count is preserved");
  assert.equal(matching.identityPreserved, false, "…and the identity is not");
  assert.equal(matching.identicalPairs.length, 0, "no component survived byte-identically");
  assert.equal(matching.changedPairs.length, 2);
  for (const p of matching.changedPairs) {
    assert.ok(p.centreDistanceMm > 0 || p.absoluteVolumeDeltaMm3 !== 0, "a paired-but-different component must report a measurable difference");
  }

  // Control: a set matched against ITSELF must come back fully identical, or
  // the matcher's "identityPreserved" would mean nothing.
  const self = matchComponentSets(
    componentSignatures(before, beforeReport, 1),
    componentSignatures(before, beforeReport, 1),
  );
  assert.equal(self.identityPreserved, true);
  assert.equal(self.identicalPairs.length, 2);
  assert.equal(self.changedPairs.length, 0);
});

test("P2.3-14: pre-clip / post-clip component matching is deterministic for a fixed seed", () => {
  const run = () =>
    compareStageComponentIdentity(
      p23Result,
      "pre-clip-indexed",
      "post-clip-indexed",
      P23_RESOLUTION,
      p23BlendK,
      p23Mesh.plateReference!,
      p23Conditions.envelope.layerHeightMm,
    );
  const a = run();
  const b = run();
  assert.equal(JSON.stringify(a.matching), JSON.stringify(b.matching), "the same candidate must match identically every time");
  assert.equal(a.beforeReport.componentCount, b.beforeReport.componentCount);
  // The clip is not a no-op on this candidate, so a claim of "the clip severed
  // nothing" would have to survive the identity check, not the count check.
  assert.ok(a.matching.beforeCount > 0 && a.matching.afterCount > 0);
  assert.equal(
    a.matching.identicalPairs.length + a.matching.changedPairs.length + a.matching.disappearedBeforeRanks.length,
    a.matching.beforeCount,
    "every pre-clip component must be accounted for exactly once",
  );
  assert.equal(
    a.matching.identicalPairs.length + a.matching.changedPairs.length + a.matching.appearedAfterRanks.length,
    a.matching.afterCount,
    "every post-clip component must be accounted for exactly once",
  );
});

test("P2.3-15: a subset measured at its own fine step and at the PRODUCTION step are reported as two separate rows", () => {
  const ring = p23Result.units.find((u) => u.kind === "ring" && u.points.length > 2 && u.parentId !== null)!;
  const parent = p23Result.units.find((u) => u.id === ring.parentId)!;
  const cmp = compareSubsetSteps(p23Result, [parent, ring], 48, P23_RESOLUTION, p23BlendK, p23Conditions.envelope.layerHeightMm);
  assert.equal(cmp.rows.length, 2, "both rows must always be present — that is the whole correction");
  const [fine, production] = cmp.rows;
  assert.equal(fine.label, "fine-subset");
  assert.equal(production.label, "production-equivalent-step");
  // The fine row really is finer in ABSOLUTE terms: this is the conflation the
  // old single-row reading made.
  assert.ok(
    fine.counts.stepFieldUnits < production.counts.stepFieldUnits,
    `the fine row must have a smaller absolute step (fine ${fine.counts.stepFieldUnits}, production-equivalent ${production.counts.stepFieldUnits})`,
  );
  assert.ok(fine.stepRatioToFullCandidate < 1, "the fine subset row is finer than the full candidate's step");
  if (!cmp.productionEquivalentClamped) {
    // Derived, not guessed: within one rounding of the resolution integer.
    assert.ok(
      Math.abs(production.stepRatioToFullCandidate - 1) < 0.1,
      `the production-equivalent row missed the full candidate's step by ${((production.stepRatioToFullCandidate - 1) * 100).toFixed(1)}%`,
    );
  }
  assert.ok(cmp.fullStepFieldUnits > 0 && cmp.fullStepMm > 0);
});

// The two stages below need the EXACT (`unitsPointsSdf`) field, which costs
// ~res³. They run at a deliberately small resolution: what they check is that
// the INSTRUMENT returns a coherent structure, not what the candidate's
// production numbers are. The production numbers come from
// `npm run diagnose:ring-fusion`, which is not part of this suite.
const P23_EXACT_RESOLUTION = 24;

test("P2.3-16: the HARD union is meshed at the same bounds/resolution and its components are mapped into the smooth components BY VOLUME", () => {
  const smoothMesh = buildCandidateMesh(p23Result, P23_EXACT_RESOLUTION, p23BlendK);
  const smoothReport = measureComponents(
    smoothMesh.triangles,
    smoothMesh.scaleMmPerUnit,
    smoothMesh.plateReference!,
    p23Conditions.envelope.layerHeightMm,
  );
  const hard = measureHardUnionMesh(
    p23Result,
    smoothMesh.triangles,
    smoothReport,
    P23_EXACT_RESOLUTION,
    p23BlendK,
    smoothMesh.plateReference!,
    p23Conditions.envelope.layerHeightMm,
    10,
  );
  assert.equal(hard.resolution, P23_EXACT_RESOLUTION);
  assert.ok(hard.report.componentCount >= 1, "the hard union must mesh to at least one component");
  assert.equal(hard.containment.length, hard.report.componentCount, "every hard component must get a containment row");
  for (const c of hard.containment) {
    assert.ok(c.insideCells >= 0);
    // The hard union is a subset of the smooth union (P2.3-7), so hard volume
    // that no smooth component contains would mean the two meshes disagree.
    // Reported rather than asserted to zero — the mesher's discretisation can
    // legitimately leave a thin rind — but it must be a minority.
    assert.ok(
      c.insideCells === 0 || c.cellsInNoSmoothComponent < c.insideCells,
      `hard component ${c.hardRank}: none of its ${c.insideCells} interior cells landed in any smooth component`,
    );
    for (const s of c.bySmoothRank) assert.ok(s.cells > 0 && s.volumeMm3 > 0);
  }
  // Volumes, not surface vertices: every per-component number here is a volume.
  for (const c of hard.report.components) assert.ok(Number.isFinite(c.signedVolumeProxyMm3) && Number.isFinite(c.absoluteVolumeProxyMm3));
  assert.ok(hard.smoothRanksContainingHardMaterial.every((r) => r >= 0 && r < smoothReport.componentCount));
});

test("P2.3-17: the components the INDEXED sampler adds are kept separate from the ones already present in the EXACT field", () => {
  const populations = partitionExactIndexedPopulations(
    p23Result,
    P23_EXACT_RESOLUTION,
    p23BlendK,
    p23Mesh.plateReference!,
    p23Conditions.envelope.layerHeightMm,
  );
  assert.ok(populations.exactComponentCount >= 1);
  assert.ok(populations.indexedComponentCount >= 1);
  // The two populations partition the indexed mesh's components exactly once
  // each — never folded together into a single cause.
  assert.equal(
    populations.indexedSharedRanks.length + populations.indexedAddedRanks.length,
    populations.indexedComponentCount,
    "every indexed component must be either shared with the exact field or added by the sampler, exactly once",
  );
  for (const r of populations.indexedAddedRanks) assert.ok(!populations.indexedSharedRanks.includes(r));
  assert.equal(
    populations.matching.identicalPairs.length + populations.matching.changedPairs.length + populations.matching.disappearedBeforeRanks.length,
    populations.exactComponentCount,
  );
  assert.ok(populations.maxPairingDistanceMm >= 0, "the weakest pairing distance is always reported, so a bad pairing is visible");
  // Determinism: same candidate, same populations.
  const again = partitionExactIndexedPopulations(
    p23Result,
    P23_EXACT_RESOLUTION,
    p23BlendK,
    p23Mesh.plateReference!,
    p23Conditions.envelope.layerHeightMm,
  );
  assert.deepEqual(again.indexedAddedRanks, populations.indexedAddedRanks);
  assert.deepEqual(again.indexedSharedRanks, populations.indexedSharedRanks);
});

test("P2.3-18: the diagnosis module is not reachable from any production entry point", () => {
  // The whole premise of this module is "changes no production behavior". That
  // is only true while nothing shipped imports it, so it is checked rather than
  // asserted in a comment: crawl the import graph from every `*.html` entry.
  const here = pathDirname(fileURLToPath(import.meta.url));
  const repoRoot = pathResolve(here, "..", "..", "..");
  const readSource = (file: string): string => readFileSync(file, "utf8");
  const entryScripts: string[] = [];
  for (const name of readdirSync(repoRoot)) {
    if (!name.endsWith(".html")) continue;
    for (const m of readSource(pathJoin(repoRoot, name)).matchAll(/<script[^>]*src="([^"]+)"/g)) {
      const src = m[1];
      if (src.startsWith("/src/")) entryScripts.push(pathJoin(repoRoot, src.slice(1)));
    }
  }
  assert.ok(entryScripts.length > 0, "found no module entry scripts — the crawler is broken, not the import graph");

  const seen = new Set<string>();
  const queue = [...entryScripts];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const src = readSource(file);
    const specifiers = [
      ...[...src.matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]),
      ...[...src.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]),
      ...[...src.matchAll(/new URL\(\s*["']([^"']+)["']/g)].map((m) => m[1]),
    ];
    for (const spec of specifiers) {
      if (spec.startsWith(".")) queue.push(pathResolve(pathDirname(file), spec));
      else if (spec.startsWith("/src/")) queue.push(pathJoin(repoRoot, spec.slice(1)));
    }
  }
  // The crawler works: a file that IS production-reachable is in the set.
  assert.ok(
    seen.has(pathJoin(repoRoot, "src", "studies", "interior-growth", "meshExport.ts")),
    "the crawler did not reach a file that is certainly production-reachable — fix the crawler before trusting its negative result",
  );
  for (const forbidden of [
    "ringFusionDiagnosis.ts",
    "ringFusionDiagnosis.report.ts",
    // P25 additions — same premise, same check.
    "ringSamplingDiagnosis.ts",
    "ringSamplingDiagnosis.report.ts",
    // P2.6 Phase C1 stays diagnostic until every shell is safe to orient.
    "solidTopology.ts",
    // P2.6 Phase C2 source-tetra tracing is likewise diagnosis-only.
    "sourceTetraDiagnostics.ts",
  ]) {
    const path = pathJoin(repoRoot, "src", "studies", "interior-growth", forbidden);
    assert.equal(seen.has(path), false, `${forbidden} is reachable from a production entry — this module is no longer diagnosis-only`);
  }
});

// === P2.4 (2026-07-27): order dependence, blendK, every edge, exact vs indexed ===
//
// Same rule as the P2.3 block above: these pin the MEASUREMENT, not a hoped-for
// outcome. Where a measurement says the composition is order-dependent, that is
// what is asserted — the verdict is never flipped to the comfortable answer, and
// no tolerance is widened to let a number through.
//
// Cost discipline: the full 3-host x 8-order x 2-form matrix and the 6-point
// blendK sweep live in `npm run diagnose:ring-fusion` (`--sections=order`,
// `--sections=blendk`, ...). What runs here is determinism, the algebraic
// controls, and the two production-resolution numbers that must not drift
// silently: the hard union's component count and box rank 1's hard overlap.

/** Every host, grown ring-constrained at the default fixture, plus its production mesh. Built once: three growths and three resolution-64 meshes are already the expensive part of this block. */
const P24_HOSTS: HostFixtureId[] = ["box", "sphere", "waisted"];
const p24Runs = new Map<
  HostFixtureId,
  {
    result: GrowthResult;
    blendK: number;
    mesh: ReturnType<typeof buildCandidateMesh>;
    report: ReturnType<typeof measureComponents>;
    layerHeightMm: number;
  }
>();
for (const hostId of P24_HOSTS) {
  const c = o2Conditions(hostId);
  const result = growNetwork(hostId, c.envelope, c.params, "ring-constrained", c.fit.scaleMmPerUnit);
  const blendK = result.params.unitRadius * 0.3;
  const mesh = buildCandidateMesh(result, 64, blendK);
  const report = measureComponents(mesh.triangles, mesh.scaleMmPerUnit, mesh.plateReference!, c.envelope.layerHeightMm);
  p24Runs.set(hostId, { result, blendK, mesh, report, layerHeightMm: c.envelope.layerHeightMm });
}

/** Drop the wall-clock columns before comparing two runs: they are measurements OF THIS MACHINE, not of the candidate, and are the only fields allowed to differ. */
function withoutTimings(value: unknown): string {
  return JSON.stringify(value, (key, v) => (key === "buildMs" || key === "meshMs" ? undefined : v));
}

test("P2.4-1: the order-explicit folds reproduce BOTH shipped unions bit-for-bit in the natural order — the precondition for every order measurement", () => {
  // If this ever fails, every P2.4 row is measuring the instrument instead of
  // the field, and none of them may be quoted.
  const f = measureFoldFidelity(p23Result, p23BlendK, 10);
  assert.ok(f.latticeCompared >= 1000, `expected a meaningful lattice, got ${f.latticeCompared}`);
  assert.equal(f.exactMismatches, 0, `foldExactUnionSdf(canonical order) differed from unitsPointsSdf at ${f.exactMismatches} points`);
  assert.equal(f.maxAbsExactDifference, 0, "bit-for-bit, not within a tolerance");
  assert.equal(
    f.indexedMismatches,
    0,
    `createOrderedIndexedQuery(canonical order) differed from createUnitsFieldSampler at ${f.indexedMismatches} points`,
  );
  assert.equal(f.maxAbsIndexedDifference, 0, "bit-for-bit, not within a tolerance");

  // And the fold really is the operator under test rather than a wrapper that
  // happens to agree: folding a DIFFERENT order at a point where the elements
  // interact must be free to differ, which is what P2.4-3 goes on to measure.
  const canonical = canonicalElements(p23Result.units);
  assert.ok(canonical.length > p23Result.units.length, "a ring decomposes to more elements than units");
  assert.equal(canonical[0].canonicalId, 0);
  assert.equal(canonical[canonical.length - 1].canonicalId, canonical.length - 1);
});

test("P2.4-2: every ordering is a PERMUTATION of the canonical element set — same elements, different sequence, deterministically", () => {
  const canonical = orderedElementList(p23Result.units, "natural", "natural").map((c) => c.canonicalId);
  const canonicalSet = [...canonical].sort((a, b) => a - b);
  for (const unitOrder of UNIT_ORDERS) {
    for (const elementOrder of ELEMENT_ORDERS) {
      const ids = orderedElementList(p23Result.units, unitOrder, elementOrder).map((c) => c.canonicalId);
      assert.equal(ids.length, canonical.length, `${unitOrder}/${elementOrder}: element count changed`);
      assert.deepEqual([...ids].sort((a, b) => a - b), canonicalSet, `${unitOrder}/${elementOrder}: not a permutation of the canonical set`);
      // Deterministic: the seeded shuffle included.
      assert.deepEqual(orderedElementList(p23Result.units, unitOrder, elementOrder).map((c) => c.canonicalId), ids, `${unitOrder}/${elementOrder}: not deterministic`);
    }
  }
  // `reversed` really reverses, and never mutates the caller's array.
  const before = p23Result.units.map((u) => u.id);
  const reversed = orderUnits(p23Result.units, "reversed").map((u) => u.id);
  assert.deepEqual(p23Result.units.map((u) => u.id), before, "orderUnits must not mutate its input");
  assert.deepEqual(reversed, [...before].reverse());
  // The shuffle is a real permutation, not the identity.
  const shuffled = orderUnits(p23Result.units, "seeded-shuffle").map((u) => u.id);
  assert.equal(shuffled.length, before.length);
  assert.ok(shuffled.some((id, i) => id !== before[i]), "the seeded shuffle produced the identity permutation");
});

/**
 * The in-suite order matrix: waisted, INDEXED form only, resolution 40 and no
 * per-component hard-overlap tally. The full matrix (both forms, resolution 64,
 * all three hosts, the volumetric tally) is `--sections=order` in the runner.
 * The verdict asserted below is the verdict AT THESE SETTINGS.
 */
const p24Order = measureOrderDependence(p23Result, {
  resolution: P23_RESOLUTION,
  blendK: p23BlendK,
  lattice: 12,
  hardOverlapDensities: null,
  includeExactForm: false,
  layerHeightMm: p23Conditions.envelope.layerHeightMm,
  plateReference: p23Mesh.plateReference!,
});

test("P2.4-3: the order-dependence measurement is deterministic, and its VERDICT is asserted as measured", () => {
  const again = measureOrderDependence(p23Result, {
    resolution: P23_RESOLUTION,
    blendK: p23BlendK,
    lattice: 12,
    hardOverlapDensities: null,
    includeExactForm: false,
    layerHeightMm: p23Conditions.envelope.layerHeightMm,
    plateReference: p23Mesh.plateReference!,
  });
  assert.equal(withoutTimings(again), withoutTimings(p24Order), "the same candidate and options must produce identical rows every time");

  // Structure: 4 unit orders x 2 element orders, one of which is the reference.
  assert.equal(p24Order.rows.length, UNIT_ORDERS.length * ELEMENT_ORDERS.length);
  const reference = p24Order.rows.filter((r) => r.isNaturalReference);
  assert.equal(reference.length, 1, "exactly one row is the natural-order reference");
  assert.equal(reference[0].signDisagreementsVsNatural, 0, "the reference cannot disagree with itself");
  assert.equal(reference[0].identityPreservedVsNatural, true);
  assert.equal(reference[0].permutationDiffersFromNatural, false);
  assert.equal(reference[0].maxCanonicalDisplacement, 0);

  // THE VERDICT. Measured 2026-07-27 on waisted at resolution 40, indexed form:
  // permuting the fold order changes the field, and changes it enough to move
  // the zero isosurface. This is asserted as TRUE because that is what it
  // measures — an assertion of order-INDEPENDENCE here would be false.
  assert.equal(
    p24Order.orderDependent,
    true,
    "the flat left-fold smooth union measured as order-INdependent; if that is now genuinely true, re-measure and rewrite this test rather than relax it",
  );
  assert.ok(p24Order.orderDependentLabels.length > 0);
  assert.ok(
    p24Order.maxAbsFieldDifferenceAnyRow > 0,
    "a permuted order that changes no field value at all would mean the fold is associative, which the polynomial smooth-min is not",
  );
  // Every row that really is a different sequence must be reported as one.
  for (const r of p24Order.rows) {
    if (!r.isNaturalReference && r.permutationDiffersFromNatural) assert.ok(r.maxCanonicalDisplacement > 0);
    assert.equal(r.latticeCompared, 12 ** 3);
    assert.ok(r.componentCount >= 1);
    assert.ok(r.totalAbsoluteVolumeProxyMm3 > 0);
    assert.equal(r.hardTally, null, "this in-suite run deliberately skips the volumetric tally; the runner does it");
  }
});

test("P2.4-4: the blendK sweep is deterministic, and its blendK = 0 point IS the hard union (the control that says the sweep is wired to the real field)", () => {
  // Two multipliers only: 0 (the control) and 1 (production). The full six-point
  // sweep is `--sections=blendk` in the runner.
  const options = {
    resolution: 20,
    multipliers: [0, 1] as const,
    lattice: 10,
    hardOverlapDensities: null,
    includeExactIndexedIdentity: false,
  };
  const a = measureBlendKSweep(p23Result, options);
  const b = measureBlendKSweep(p23Result, options);
  assert.equal(withoutTimings(a), withoutTimings(b), "the sweep must be deterministic for a fixed seed");
  assert.equal(a.points.length, 2);
  assert.equal(a.productionBlendK, p23Result.params.unitRadius * 0.3, "the production blend is read from the code, never hard-coded");
  assert.equal(a.points[1].blendK, a.productionBlendK, "multiplier 1.0 must be exactly the production blend");

  const [zero, production] = a.points;
  assert.equal(zero.blendK, 0);
  // At k = 0 `smoothMin` returns `Math.min`, so the smooth union IS the hard
  // union: no material is added anywhere, and the outward-distance proxy is 0.
  assert.equal(zero.smoothOnly.smoothOnlyCells, 0, "blendK = 0 added smooth-only material, which would mean smoothMin(k=0) is not min");
  assert.equal(zero.smoothOnly.smoothOnlyVolumeMm3, 0);
  assert.equal(zero.maxOutwardDistanceProxyMm, 0);
  assert.equal(zero.smoothComponentCount, zero.hardComponentCount, "at k = 0 the smooth and hard meshes are the same mesh");
  // …and the production point is genuinely blended, or the sweep is measuring nothing.
  assert.ok(production.blendK > 0);
  assert.ok(production.smoothOnly.smoothOnlyCells > 0, "the production blend must add material the hard union does not have");
  assert.ok(production.maxOutwardDistanceProxyMm > 0);
  // The ordering the whole P2.3 correction rests on, re-checked at both points.
  for (const p of a.points) {
    assert.equal(p.smoothOnly.hardOnlyCells, 0, `blendK ${p.blendK}: found hard material outside the smooth union, which smoothMin <= min forbids`);
    // `blended <= hard` holds only for `blendK >= HARD_UNION_BLEND_K`, because the
    // "hard" reference is not literally k = 0: it is `unitsPointsSdf(units,
    // HARD_UNION_BLEND_K)`, and `smoothMin` is monotonically decreasing in k.
    // At the k = 0 control the smooth field is the EXACT `Math.min` while the
    // reference still subtracts up to `HARD_UNION_BLEND_K / 4`, so the ordering
    // reverses there by that bound and no more. Measured on waisted: 671 of 1000
    // lattice points, every one of them by exactly 2.5e-10 = k/4 — a ring's
    // closed capsule chain makes two adjacent capsules tie exactly (they share an
    // endpoint), which is the h = 0.5 case where the subtraction is largest.
    if (p.blendK >= HARD_UNION_BLEND_K) {
      assert.equal(p.ordering.blendedAboveHardCount, 0, `blendK ${p.blendK}: blended rose above the hard reference, which smoothMin <= min forbids for k >= the reference k`);
    } else {
      assert.ok(
        p.ordering.maxBlendedMinusHard <= HARD_UNION_BLEND_K,
        `blendK ${p.blendK}: the k = 0 control exceeded the hard reference by ${p.ordering.maxBlendedMinusHard}, more than the analytic HARD_UNION_BLEND_K/4 bound allows (the assertion leaves float slack up to HARD_UNION_BLEND_K itself)`,
      );
    }
    assert.equal(p.measuredSurfaceCoverage, p23Result.measuredSurfaceCoverage, "surface coverage is measured against the HARD material model and cannot move with blendK");
  }
  // And the multipliers the sweep ships with are the ones the runner uses.
  assert.deepEqual([...BLEND_K_SWEEP_MULTIPLIERS], [0, 0.25, 0.5, 0.75, 1, 1.25]);

  // `measureSmoothOnlyRegion` on its own agrees with the sweep's own column.
  const direct = measureSmoothOnlyRegion(p23Result, a.productionBlendK, 10);
  assert.equal(direct.smoothOnlyCells, production.smoothOnly.smoothOnlyCells);
  assert.equal(direct.insideHardCells, production.smoothOnly.insideHardCells);
});

test("P2.4-5: the HARD-union component count at production bounds/resolution is pinned at box 27 / sphere 12 / waisted 20", () => {
  // The number the whole §3 classification exists to explain. Measured
  // 2026-07-27 at resolution 64, blendK = unitRadius x 0.3 for the BOUNDS and
  // `HARD_UNION_BLEND_K` for the field, post-clip — exactly what
  // `buildHardUnionStageMesh` composes.
  const expected: Record<string, number> = { box: 27, sphere: 12, waisted: 20 };
  for (const hostId of P24_HOSTS) {
    const run = p24Runs.get(hostId)!;
    const hardMesh = buildHardUnionStageMesh(run.result, 64, run.blendK, true);
    const hardReport = measureComponents(hardMesh.triangles, hardMesh.scaleMmPerUnit, run.mesh.plateReference!, run.layerHeightMm);
    assert.equal(
      hardReport.componentCount,
      expected[hostId],
      `${hostId}: the hard union meshed to ${hardReport.componentCount} components, not the pinned ${expected[hostId]}`,
    );
    // …and it is genuinely WORSE than the smooth mesh, which is the finding:
    // a hard union is not the fix for the smooth union's fragmentation.
    assert.ok(
      hardReport.componentCount > run.report.componentCount,
      `${hostId}: hard ${hardReport.componentCount} vs smooth ${run.report.componentCount} — the hard union is supposed to be the worse one`,
    );
    assert.equal(HARD_UNION_BLEND_K, 1e-9, "the hard union's blend is a named constant, not an inline literal");
  }
  // The smooth saved-mesh counts the P2.3 round recorded, re-checked here so the
  // comparison above cannot drift on the other side.
  assert.equal(p24Runs.get("box")!.report.componentCount, 10);
  assert.equal(p24Runs.get("sphere")!.report.componentCount, 3);
  assert.equal(p24Runs.get("waisted")!.report.componentCount, 5);
});

test("P2.4-6: the all-edge production-step classification is deterministic and its class totals add up to the edge count", () => {
  const options = {
    resolution: P23_RESOLUTION,
    boundsBlendK: p23BlendK,
    gapSamplesPerSegment: 9,
    layerHeightMm: p23Conditions.envelope.layerHeightMm,
    includeUnitsAlone: true,
  };
  const edges = measureAllEdges(p23Result, options);
  // Every parent-child edge, not a sample of them.
  const graphEdges = p23Result.units.filter((u) => u.parentId !== null && p23Result.units.some((v) => v.id === u.parentId)).length;
  assert.equal(edges.edgeCount, graphEdges, `expected every parent-child edge (${graphEdges}), measured ${edges.edgeCount}`);
  assert.ok(edges.edgeCount > 300, `the waisted fixture should have several hundred edges, got ${edges.edgeCount}`);

  // THE accounting requirement: the classes partition the edges exactly once each.
  const total = EDGE_CONTACT_CLASSES.reduce((s, c) => s + edges.countByClass[c], 0);
  assert.equal(total, edges.edgeCount, "the four classes must partition the edges — no edge counted twice, none dropped");
  for (const cls of EDGE_CONTACT_CLASSES) assert.ok(edges.countByClass[cls] >= 0);
  assert.equal(
    edges.edges.filter((e) => e.classification === "unclassified").length,
    edges.countByClass.unclassified,
    "the tally must match the per-edge rows",
  );
  // Every row carries the step it was measured at, and it is the production one.
  for (const e of edges.edges) {
    assert.ok(e.productionEquivalentResolution >= 8, `edge ${e.parentId}->${e.childId}: resolution ${e.productionEquivalentResolution} below the mesher's own floor`);
    if (!e.productionEquivalentClamped) {
      assert.ok(
        Math.abs(e.stepRatioToFullCandidate - 1) < 0.1,
        `edge ${e.parentId}->${e.childId} missed the full candidate's step by ${((e.stepRatioToFullCandidate - 1) * 100).toFixed(1)}%`,
      );
    }
    // A negative sampled gap is achieved by a real point pair, so it can never
    // be classified as not-in-contact.
    if (e.gap.sampledMinSignedGapFieldUnits < 0) assert.notEqual(e.classification, "not-in-contact");
    // The closest-pair locator is filled in whenever a minimum was found.
    assert.ok(e.gap.closestPointA !== null && e.gap.closestPointB !== null, `edge ${e.parentId}->${e.childId} reported no closest pair`);
    assert.ok(Math.abs((e.gap.closestCentreDistanceFieldUnits ?? 0) - (e.gap.closestRadiusA ?? 0) - (e.gap.closestRadiusB ?? 0) - e.gap.sampledMinSignedGapFieldUnits) < 1e-12,
      "the reported closest pair must reproduce the reported gap");
  }
  assert.equal(edges.units.length, p23Result.units.length, "every unit gets a within-unit row, not a sample");
  assert.equal(edges.withinUnitFragmentExcess, edges.units.reduce((s, u) => s + u.fragmentExcess, 0));

  // The accounting is a subtraction with a reported residual, never a fit.
  const acct = accountHardUnionFragmentation(20, edges);
  assert.equal(acct.predictedComponentCount, 1 + acct.severedEdges + acct.withinUnitFragmentExcess);
  assert.equal(acct.residual, acct.hardUnionComponentCount - acct.predictedComponentCount);

  // Determinism, on a small pruned fixture so the second full pass is not paid for.
  const pruned: GrowthResult = { ...p23Result, units: p23Result.units.slice(0, 10) };
  const prunedOptions = { ...options, gapSamplesPerSegment: 7 };
  assert.equal(
    JSON.stringify(measureAllEdges(pruned, prunedOptions)),
    JSON.stringify(measureAllEdges(pruned, prunedOptions)),
    "the all-edge measurement must be deterministic",
  );
  // The derived subset resolution is a single definition shared with compareSubsetSteps.
  const child = p23Result.units.find((u) => u.parentId !== null)!;
  const parent = p23Result.units.find((u) => u.id === child.parentId)!;
  const derived = productionEquivalentSubsetResolution(p23Result, [parent, child], p23BlendK, P23_RESOLUTION);
  const viaComparison = compareSubsetSteps(p23Result, [parent, child], 48, P23_RESOLUTION, p23BlendK, p23Conditions.envelope.layerHeightMm);
  assert.equal(derived.fullStepFieldUnits, viaComparison.fullStepFieldUnits, "one derivation of the production step, not two");
  assert.equal(derived.clamped, viaComparison.productionEquivalentClamped);
  assert.equal(derived.equivalentResolution, viaComparison.rows[1].counts.requestedResolution);
});

test("P2.4-7 (REGRESSION): waisted's exact and indexed fields agree on the component COUNT and still hold different components — and the difference decomposes exactly into SET, ORDER and CUTOFF", () => {
  // The P2.3 round measured 5 components in both fields at resolution 64 and a
  // worst pairing distance of 65.763mm between them. Equal counts are not a
  // pass; this is the test that says so.
  const populations = partitionExactIndexedPopulations(
    p23Result,
    P23_EXACT_RESOLUTION,
    p23BlendK,
    p23Mesh.plateReference!,
    p23Conditions.envelope.layerHeightMm,
  );
  assert.equal(populations.matching.countPreserved, true, "this fixture exists because the two fields agree on the count");
  assert.equal(
    populations.matching.identityPreserved,
    false,
    "…and disagree on the components themselves; if the two fields ever become identical, re-measure and rewrite this test",
  );
  assert.ok(
    populations.maxPairingDistanceMm > 0,
    "an identity gap with a zero worst-pairing distance would mean the pairing is not measuring anything",
  );

  // The decomposition. The three effects are a partition of `exact - indexed`
  // by construction, so the reconstruction residual is float round-off only.
  const d = decomposeExactIndexedDifference(p23Result, p23BlendK, 12);
  assert.ok(d.compared >= 1000);
  assert.equal(d.totalElements, canonicalElements(p23Result.units).length);
  const scaleOfTerms = 1 + Math.max(d.maxAbsSetEffect, d.maxAbsOrderEffect, d.maxAbsCutoffEffect, d.maxAbsTotalDifference);
  assert.ok(
    d.maxReconstructionResidual <= 1e-12 * scaleOfTerms,
    `set + order + cutoff did not reconstruct the difference (residual ${d.maxReconstructionResidual})`,
  );
  // The indexed sampler really is answering from a SUBSET, in a NON-canonical
  // order — both causes are present, so attributing the gap needs the split.
  assert.ok(d.pointsWithReducedElementSet > 0, "the indexed query returned every element everywhere, so there is no SET effect to separate");
  assert.ok(d.pointsWithNonCanonicalOrder > 0, "the indexed query returned canonical order everywhere, so there is no ORDER effect to separate");
  assert.ok(d.maxRankDisplacement > 0);
  // Determinism.
  assert.equal(JSON.stringify(decomposeExactIndexedDifference(p23Result, p23BlendK, 12)), JSON.stringify(d));

  // Only a SIGN flip can move a component; the totals must be consistent with
  // the per-effect counts rather than exceed their sum.
  assert.ok(
    d.totalSignFlips <= d.setEffectSignFlips + d.orderEffectSignFlips + d.cutoffEffectSignFlips + d.pointsWithEmptyQuery,
    "a net sign flip with no contributing effect would mean the decomposition missed a cause",
  );

  // Topology-level attribution: the middle field (indexed SET, canonical ORDER)
  // is the control that splits the gap into its two halves.
  const attribution = measureExactIndexedTopologyAttribution(
    p23Result,
    P23_EXACT_RESOLUTION,
    p23BlendK,
    p23Mesh.plateReference!,
    p23Conditions.envelope.layerHeightMm,
  );
  assert.equal(attribution.reports.length, 3);
  assert.equal(
    attribution.componentCountByField["exact-all-canonical"],
    populations.exactComponentCount,
    "the probe's exact field must be the same field partitionExactIndexedPopulations meshed",
  );
  assert.equal(attribution.componentCountByField["indexed-as-shipped"], populations.indexedComponentCount);
  // The two halves must together reach at least as far as the whole gap does —
  // a whole-gap distance larger than both halves would mean the middle control
  // is not on the path between them.
  assert.ok(
    attribution.setStepMaxPairingDistanceMm + attribution.orderStepMaxPairingDistanceMm >= attribution.wholeGapMaxPairingDistanceMm - 1e-9,
    `the SET half (${attribution.setStepMaxPairingDistanceMm}mm) and ORDER half (${attribution.orderStepMaxPairingDistanceMm}mm) do not cover the whole gap (${attribution.wholeGapMaxPairingDistanceMm}mm)`,
  );
  assert.ok(["set", "order", "equal"].includes(attribution.dominantStep));
  // Determinism of the attribution's own component counts.
  const againAttribution = measureExactIndexedTopologyAttribution(
    p23Result,
    P23_EXACT_RESOLUTION,
    p23BlendK,
    p23Mesh.plateReference!,
    p23Conditions.envelope.layerHeightMm,
  );
  assert.deepEqual(againAttribution.componentCountByField, attribution.componentCountByField);
  assert.equal(againAttribution.dominantStep, attribution.dominantStep);

  // The middle field is built from the SAME index the shipped sampler uses, so
  // an empty query answers `cutoff` in both — checked directly rather than
  // assumed, since a mismatch there would show up as a fake SET effect.
  const query = createOrderedIndexedQuery(canonicalElements(p23Result.units).map((c) => c.element), p23BlendK);
  const far = { x: 1e4, y: 1e4, z: 1e4 };
  assert.equal(query.queryOrder(far.x, far.y, far.z).length, 0);
  assert.equal(query.sample(far.x, far.y, far.z), query.cutoff);
  assert.equal(foldExactUnionSdf([], p23BlendK, far.x, far.y, far.z), 1e5, "the empty fold's sentinel is the shipped one");
});

test("P2.4-8 (RE-MEASUREMENT): box rank 1's hard overlap, at the two grid densities, with the verdict stated as measured", () => {
  const run = p24Runs.get("box")!;
  assert.ok(run.report.componentCount > 1, "box is the known multi-component case");
  const densities = [20, 32] as const;
  const rank1 = measureComponentHardOverlap(
    componentTriangles(run.mesh.triangles, run.report, 1),
    1,
    run.result.units,
    run.mesh.scaleMmPerUnit,
    densities,
    run.mesh.plateReference!,
  );
  // The measurement is only meaningful on a closed, consistently-wound surface.
  assert.ok(rank1.surface.closed, "box rank 1 is not a closed surface — no volumetric statement about it is valid");
  assert.ok(rank1.surface.windingConsistent);
  assert.equal(rank1.grids.length, 2, "two densities, so a verdict that flips with resolution is visible");
  for (const g of rank1.grids) {
    assert.ok(g.insideCells > 0, `density ${g.samplesPerLongestEdge} found no cell inside the component`);
    assert.equal(
      g.hardNegativeInsideCells + g.hardPositiveInsideCells + g.ambiguousInsideCells,
      g.insideCells,
      "every inside cell must be in exactly one of the three tallies",
    );
  }
  // THE RE-MEASURED VERDICT (2026-07-27, densities 20 and 32, resolution 64):
  // the two densities AGREE and neither finds hard material. The P2.3 round
  // recorded this component as undetermined; this is the re-measurement that
  // says otherwise, asserted as measured rather than left at the older word.
  assert.equal(rank1.densitiesAgree, true, "the two densities disagreed about box rank 1 — re-measure and rewrite this test rather than pick one");
  assert.equal(rank1.hardNegativeAtNoDensity, true);
  assert.equal(classifyComponentHardOverlap(rank1), "no-hard-material-found");
  // box rank 1 is the ONE component where the old surface-vertex criterion does
  // NOT read 0: 18 of its 1068 vertices (1.7%) sit inside the hard union — the
  // exception already recorded in the P2.3 Observation. The two criteria
  // therefore disagree here in the direction that matters: the surface sees hard
  // material, the volume finds none inside. That is a sharper reason to distrust
  // the surface criterion than the cases where both happen to read 0, so the
  // measured 18 is pinned rather than rounded to the tidier number.
  assert.equal(
    rank1.surfaceVerticesInsideHardUnion,
    18,
    "box rank 1's surface-vertex count moved; re-measure and update the P2.3 Observation rather than adjusting this number",
  );
  assert.ok(rank1.surfaceVerticesInsideHardUnion > 0);

  // And a region locator for it, so the runner and the README quote the same box.
  const region = boundsAroundComponent(run.mesh.triangles, run.report, 1, run.blendK * 2);
  assert.ok(region !== null && region.longest > 0);
  assert.ok(region!.min.x < region!.max.x && region!.min.y < region!.max.y && region!.min.z < region!.max.z);
  assert.equal(boundsAroundComponent(run.mesh.triangles, run.report, 9999, 0), null, "a rank with no triangles has no region, and must say so rather than return an empty box");
});

// === P25 (2026-07-27): sampling density, grid phase, and where a ring breaks ===
//
// Same rule as the P2.3 / P2.4 blocks: these pin the INSTRUMENT and the small
// synthetic controls, not a hoped-for outcome. The heavy host × resolution ×
// phase matrix lives in `npm run diagnose:ring-sampling`.
//
// The lattice tests below deliberately measure `buildMeshFromField` by watching
// where it evaluates the sdf, rather than restating its formula: the whole D1
// sweep is quoted in "cells across the tube", and that number is meaningless if
// the step it divides by is not the step the shipped mesher actually used.

test("P25-1: the shipped mesher's sampling step IS bounds.longest / resolution — measured at its own call sites, not restated", () => {
  const bounds = { min: { x: -1, y: -2, z: -0.5 }, max: { x: 3, y: 1, z: 2.5 }, size: { x: 4, y: 3, z: 3 }, longest: 4 };
  for (const resolution of [8, 16, 32, 64]) {
    const lattice = recordSamplingLattice(bounds, resolution, 1);
    const expected = bounds.longest / resolution;
    assert.equal(fieldStepOf(bounds, resolution), expected, `resolution ${resolution}: fieldStepOf disagrees with the derivation`);
    // The mesher's own grid spacing, on every axis, is that step.
    for (const [axis, measured] of [["x", lattice.stepX], ["y", lattice.stepY], ["z", lattice.stepZ]] as const) {
      assert.ok(
        Math.abs(measured - expected) <= 1e-12,
        `resolution ${resolution}, axis ${axis}: mesher sampled at ${measured}, bounds.longest / resolution is ${expected}`,
      );
    }
    // …and every sample sits exactly on `bounds.min + i * step`.
    assert.ok(lattice.maxLatticeDeviation <= 1e-12, `lattice deviates from min + i*step by ${lattice.maxLatticeDeviation}`);
    assert.equal(lattice.minSample.x, bounds.min.x, "the lattice starts at bounds.min");
  }
  // `resolution` below 8 is clamped by the mesher; the mirror clamps identically.
  assert.equal(effectiveResolution(3), 8);
  assert.equal(effectiveResolution(64.4), 64);
  assert.equal(fieldStepOf(bounds, 3), bounds.longest / 8, "a clamped resolution must use the CLAMPED step, not the requested one");
});

test("P25-2: targetLongestMm is a post-meshing rescale and changes NOTHING about sampling density", () => {
  const bounds = { min: { x: -1, y: -1, z: -1 }, max: { x: 2, y: 1, z: 1.5 }, size: { x: 3, y: 2, z: 2.5 }, longest: 3 };
  const a = recordSamplingLattice(bounds, 32, 1);
  const b = recordSamplingLattice(bounds, 32, 137.5);
  assert.equal(a.sampleCount, b.sampleCount, "targetLongestMm changed the number of field evaluations");
  assert.equal(a.stepX, b.stepX);
  assert.equal(a.stepY, b.stepY);
  assert.equal(a.stepZ, b.stepZ);
  assert.deepEqual(a.minSample, b.minSample);
  assert.deepEqual(a.maxSample, b.maxSample);
  assert.equal(a.nx, b.nx);
  assert.equal(a.ny, b.ny);
  assert.equal(a.nz, b.nz);
});

test("P25-3: gridCountsOf reproduces the mesher's own cell counts and evaluation count", () => {
  for (const bounds of [
    { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 3, z: 1 }, size: { x: 4, y: 3, z: 1 }, longest: 4 },
    { min: { x: -2, y: -5, z: -0.3 }, max: { x: 1.5, y: 2, z: 0.7 }, size: { x: 3.5, y: 7, z: 1 }, longest: 7 },
  ]) {
    for (const resolution of [8, 24, 40]) {
      const derived = gridCountsOf(bounds, resolution);
      const lattice = recordSamplingLattice(bounds, resolution, 1);
      assert.equal(derived.nx, lattice.nx, "nx");
      assert.equal(derived.ny, lattice.ny, "ny");
      assert.equal(derived.nz, lattice.nz, "nz");
      assert.equal(derived.fieldSampleCount, lattice.sampleCount, "field sample count");
    }
  }
});

test("P25-4: the tube/step derivation is exactly 2 x min node radius / step, and every host is under 2 cells across the thinnest tube at resolution 64", () => {
  // The audited fact this sweep starts from: the ring tube is under two grid
  // steps thick at the production resolution. Pinned as MEASURED — if the
  // fixture moves these have to be re-measured and rewritten, never relaxed.
  const expected: Record<HostFixtureId, { min: number; median: number; max: number; minRadius: number }> = {
    box: { min: 1.750555135036018, median: 1.9857644947609547, max: 2.24999775356155, minRadius: 0.03430777636491694 },
    sphere: { min: 1.6101185433013143, median: 1.8171455069108216, max: 2.0696580046609077, minRadius: 0.03430437780399807 },
    waisted: { min: 1.5219695372376696, median: 1.7317552062830408, max: 1.9566684906820015, minRadius: 0.034300127975968646 },
  };
  for (const hostId of P24_HOSTS) {
    const run = p24Runs.get(hostId)!;
    const bounds = diagnosisBounds(run.result, run.blendK);
    const step = fieldStepOf(bounds, 64);
    const tube = measureTubeScale(run.result.units);
    const cells = cellsAcrossTube(tube, step);
    // Every unit of this candidate is a ring, so there is no non-ring material
    // silently excluded from the feature size.
    assert.equal(tube.nonRingUnitCount, 0, `${hostId}: a non-ring unit appeared — the tube scale no longer covers all the material`);
    assert.equal(tube.ringUnitCount, run.result.units.length);
    // The derivation, exactly.
    assert.equal(tube.minTubeDiameterFieldUnits, 2 * tube.minNodeRadiusFieldUnits);
    assert.equal(cells.min, tube.minTubeDiameterFieldUnits / step);
    assert.equal(cells.max, tube.maxTubeDiameterFieldUnits / step);
    const e = expected[hostId];
    assert.equal(tube.minNodeRadiusFieldUnits, e.minRadius, `${hostId}: min node radius moved`);
    assert.equal(cells.min, e.min, `${hostId}: cells across the thinnest tube moved`);
    assert.equal(cells.median, e.median, `${hostId}: median moved`);
    assert.equal(cells.max, e.max, `${hostId}: max moved`);
    assert.ok(cells.min < 2, `${hostId}: the thinnest tube is ${cells.min} cells across — the audited "under two steps" no longer holds`);
  }
});

test("P25-5: the 8 grid phases shift the ORIGIN only — same step, same cell counts, and no material pushed out of the box", () => {
  const run = p24Runs.get("box")!;
  const bounds = diagnosisBounds(run.result, run.blendK);
  const step = fieldStepOf(bounds, 64);
  assert.equal(GRID_PHASES.length, 8);
  const seen = new Set(GRID_PHASES.map((p) => p.join(",")));
  assert.equal(seen.size, 8, "the 8 phases must be distinct");
  for (const phase of GRID_PHASES) {
    for (const f of phase) assert.ok(f === 0 || f === 0.5, "each axis is shifted by 0 or half a step, nothing else");
    const shifted = phaseShiftedBounds(bounds, phase, step);
    // Size preserved exactly => same longest => same step => same cell counts.
    assert.equal(shifted.size.x, bounds.size.x);
    assert.equal(shifted.size.y, bounds.size.y);
    assert.equal(shifted.size.z, bounds.size.z);
    assert.equal(shifted.longest, bounds.longest);
    assert.equal(fieldStepOf(shifted, 64), step, "a phase shift must not change the step");
    assert.deepEqual(gridCountsOf(shifted, 64), gridCountsOf(bounds, 64), "a phase shift must not change the number of samples");
    // The lattice really moved by exactly phase x step.
    for (const [i, axis] of (["x", "y", "z"] as const).entries()) {
      assert.ok(
        Math.abs(shifted.min[axis] - (bounds.min[axis] + phase[i] * step)) <= 1e-15,
        `axis ${axis}: origin did not move by exactly ${phase[i]} step`,
      );
    }
    // And no material fell outside — a clipped candidate would make the row
    // measure a different shape rather than a different phase.
    const clearance = materialClearanceFieldUnits(run.result.units, shifted);
    assert.ok(clearance > 0, `phase ${phase.join(",")}: material clearance ${clearance} — the shift pushed material out of the sampling box`);
  }
});

test("P25-6: an ISOLATED closed capsule ring — connected by construction — fragments at a coarse step and is one component, in ALL 8 phases, at a finer one", () => {
  // This is the control the whole undersampling hypothesis rests on. The chain
  // shares endpoints between consecutive capsules, so its hard union is a
  // connected solid and every component past the first is the grid's.
  const points = syntheticRingPoints(8, 0.35, 0.0343);

  const coarse = GRID_PHASES.map((p) => measureSyntheticRing(points, 16, p));
  assert.ok(coarse[0].cellsAcrossTube < 1, `expected under one cell across the tube at resolution 16, got ${coarse[0].cellsAcrossTube}`);
  assert.ok(
    coarse.every((m) => m.componentCount > 1),
    `an under-sampled closed ring must fragment in every phase; got [${coarse.map((m) => m.componentCount).join(", ")}]`,
  );

  // 1.878 cells across the tube is where this ring first holds together in all
  // eight phases. Asserted as MEASURED, not as a rule: the number is a property
  // of this fixture, and the sweep script is what says whether it transfers.
  const fine = GRID_PHASES.map((p) => measureSyntheticRing(points, 32, p));
  assert.ok(fine[0].cellsAcrossTube > coarse[0].cellsAcrossTube);
  assert.deepEqual(
    fine.map((m) => m.componentCount),
    [1, 1, 1, 1, 1, 1, 1, 1],
    "the finer grid must give one component in every phase, or this fixture is not a stable pass",
  );
  // The step really is finer, and the phase shift really did move the grid.
  for (const m of fine) assert.equal(m.stepFieldUnits, fine[0].stepFieldUnits);
  assert.notEqual(fine[1].bounds.min.x, fine[0].bounds.min.x);
});

test("P25-7: measureSamplingRow is deterministic — the same candidate and options give a bit-identical fingerprint", () => {
  const run = p24Runs.get("sphere")!;
  const a = measureSamplingRow(run.result, 32, { includeFragmentation: true });
  const b = measureSamplingRow(run.result, 32, { includeFragmentation: true });
  assert.equal(samplingRowFingerprint(a), samplingRowFingerprint(b));
  // The row's own internal consistency: the derived grid is the mesher's, and
  // the saved / STL-round-trip counts are counts of the same mesh.
  assert.deepEqual(a.grid, gridCountsOf(diagnosisBounds(run.result, run.blendK), 32));
  assert.equal(a.savedComponentCount, a.stlRoundTripComponentCount, "the STL bytes must decode to the same component count they were written from");
  assert.equal(a.materialClearanceFieldUnits > 0, true);
  assert.equal(a.tube.nonRingUnitCount, 0);
  // Defaults are the ones the sweep is quoted at.
  assert.equal(DEFAULT_SAMPLING_ROW_OPTIONS.minComponentShare, 0.05);
  assert.deepEqual(DEFAULT_SAMPLING_ROW_OPTIONS.phase, [0, 0, 0]);
});

test("P25-8: a break's classification is reproducible from its own reported numbers, and each of the three sites is reachable", () => {
  // Run the D2 locator on the synthetic control, where the answer is known: a
  // closed ring split by an under-sampled grid must break at least twice.
  const points = syntheticRingPoints(8, 0.35, 0.0343);
  const coarse = measureSyntheticRing(points, 16, [0, 0, 0]);
  assert.ok(coarse.componentCount > 1);
  const unit = syntheticUnit({ id: 0, kind: "ring", points });
  const report = measureComponents(coarse.triangles, 1, { axis: "y", sign: 1, plateOffsetFieldUnits: -1000 }, 0.2);
  assert.equal(report.componentCount, coarse.componentCount, "the two component counts must be of the same mesh");

  const noPlate = locateRingBreaks([unit], coarse.triangles, report, {
    bounds: coarse.bounds,
    stepFieldUnits: coarse.stepFieldUnits,
    plateSdf: null,
  });
  assert.equal(noPlate.unitsExamined, 1);
  assert.ok(noPlate.breaks.length >= 2, `a closed loop needs at least two breaks to split; got ${noPlate.breaks.length}`);
  assert.equal(noPlate.bySite["at-plate-boundary"], 0, "no plate was supplied, so no break may be attributed to one");
  assert.equal(noPlate.bySite["near-node"] + noPlate.bySite["mid-segment"], noPlate.breaks.length, "the site tallies must add up to the break count");
  // The stated rule, re-derived from each break's own reported fields.
  for (const b of noPlate.breaks) {
    const expected = b.distanceToNearestNodeFieldUnits <= b.nearestNodeRadiusFieldUnits ? "near-node" : "mid-segment";
    assert.equal(b.site, expected, `break on unit ${b.unitId} is classified ${b.site} but its own numbers say ${expected}`);
    assert.ok(b.t >= 0 && b.t <= 1);
    assert.ok(b.segmentIndex >= 0 && b.segmentIndex < points.length);
    assert.ok(b.positionUncertaintyFieldUnits > 0, "a break located between two samples has a non-zero position uncertainty");
    assert.notEqual(b.fromComponentRank, b.toComponentRank);
  }
  assert.ok(noPlate.nearNodeArcShare > 0 && noPlate.nearNodeArcShare < 1, "the near-node null share must be a real fraction of the centreline");

  // The plate branch wins when the break sits within one step of the plate
  // plane, and only then. A plate plane through the ring's own plane puts every
  // break inside the band.
  const onPlate = locateRingBreaks([unit], coarse.triangles, report, {
    bounds: coarse.bounds,
    stepFieldUnits: coarse.stepFieldUnits,
    plateSdf: () => 0,
  });
  assert.equal(onPlate.bySite["at-plate-boundary"], onPlate.breaks.length, "every break inside the plate band must be attributed to it");
  // …and a plate far away takes none of them, giving back the no-plate answer.
  const farPlate = locateRingBreaks([unit], coarse.triangles, report, {
    bounds: coarse.bounds,
    stepFieldUnits: coarse.stepFieldUnits,
    plateSdf: () => 1000,
  });
  assert.equal(farPlate.bySite["at-plate-boundary"], 0);
  assert.deepEqual(farPlate.bySite["near-node"], noPlate.bySite["near-node"]);
  assert.deepEqual(farPlate.bySite["mid-segment"], noPlate.bySite["mid-segment"]);

  // A ring whose nodes are closer together than their own radii is entirely
  // "near a node" — the positive control that says the classifier follows the
  // geometry rather than a fixed proportion.
  const dense = syntheticRingPoints(40, 0.35, 0.0343);
  const denseMesh = measureSyntheticRing(dense, 16, [0, 0, 0]);
  if (denseMesh.componentCount > 1) {
    const denseReport = measureComponents(denseMesh.triangles, 1, { axis: "y", sign: 1, plateOffsetFieldUnits: -1000 }, 0.2);
    const denseBreaks = locateRingBreaks([syntheticUnit({ id: 0, kind: "ring", points: dense })], denseMesh.triangles, denseReport, {
      bounds: denseMesh.bounds,
      stepFieldUnits: denseMesh.stepFieldUnits,
      plateSdf: null,
    });
    assert.equal(denseBreaks.bySite["mid-segment"], 0, "on a ring whose half-segment is shorter than a node radius nothing can be mid-segment");
    assert.equal(denseBreaks.nearNodeArcShare, 1, "…and the near-node null share is the whole centreline, which is exactly why that column needs the null");
  }
});

test("P25-9: the copied tetrahedron tables ARE the shipped mesher's, and tetIndexOf returns a tetrahedron that contains the point", () => {
  // The mesher's TETS/CUBE_OFFSETS are module-private, and this diagnosis must
  // not edit a production file to read them. The copy is therefore checked
  // against that file's source: a change there fails HERE rather than silently
  // making the D2 phase columns describe a decomposition nothing uses.
  const here = pathDirname(fileURLToPath(import.meta.url));
  const source = readFileSync(pathResolve(here, "..", "cloud-sculpt", "meshExport.ts"), "utf8");
  const literalOf = (name: string): number[][] => {
    const m = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const;`));
    assert.ok(m, `could not find ${name} in cloud-sculpt/meshExport.ts — the crawler is broken, not the copy`);
    return [...m![1].matchAll(/\[([^\]]*)\]/g)].map((row) => row[1].split(",").map((v) => Number(v.trim())));
  };
  assert.deepEqual(literalOf("TETS"), MESHER_TETS.map((t) => [...t]), "MESHER_TETS no longer matches the shipped mesher");
  assert.deepEqual(literalOf("CUBE_OFFSETS"), MESHER_CUBE_OFFSETS.map((t) => [...t]), "MESHER_CUBE_OFFSETS no longer matches the shipped mesher");

  // Every tetrahedron starts at corner 0 and ends at corner 6 — the precondition
  // for the Kuhn-simplex derivation `tetIndexOf` is built on.
  for (const tet of MESHER_TETS) {
    assert.equal(tet[0], 0);
    assert.equal(tet[3], 6);
  }
  assert.deepEqual([...MESHER_CUBE_OFFSETS[0]], [0, 0, 0]);
  assert.deepEqual([...MESHER_CUBE_OFFSETS[6]], [1, 1, 1]);

  // tetIndexOf is a bijection onto 0..5 over the six coordinate orderings…
  const hit = new Set<number>();
  for (const [fx, fy, fz] of [[0.7, 0.5, 0.2], [0.7, 0.2, 0.5], [0.5, 0.7, 0.2], [0.2, 0.7, 0.5], [0.2, 0.5, 0.7], [0.5, 0.2, 0.7]]) {
    hit.add(tetIndexOf(fx, fy, fz));
  }
  assert.equal(hit.size, 6, "the six coordinate orderings must map to the six distinct tetrahedra");

  // …and the tetrahedron it names really contains the point: barycentric
  // coordinates against that tet's four corners are all non-negative.
  const contains = (fx: number, fy: number, fz: number, index: number): boolean => {
    const c = MESHER_TETS[index].map((corner) => MESHER_CUBE_OFFSETS[corner]);
    const [p0, p1, p2, p3] = c;
    const m = [
      [p1[0] - p0[0], p2[0] - p0[0], p3[0] - p0[0]],
      [p1[1] - p0[1], p2[1] - p0[1], p3[1] - p0[1]],
      [p1[2] - p0[2], p2[2] - p0[2], p3[2] - p0[2]],
    ];
    const det =
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const r = [fx - p0[0], fy - p0[1], fz - p0[2]];
    const solve = (col: number): number => {
      const a = m.map((row) => [...row]);
      for (let i = 0; i < 3; i++) a[i][col] = r[i];
      const d =
        a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
        a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
        a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
      return d / det;
    };
    const b1 = solve(0);
    const b2 = solve(1);
    const b3 = solve(2);
    const b0 = 1 - b1 - b2 - b3;
    return b0 >= -1e-12 && b1 >= -1e-12 && b2 >= -1e-12 && b3 >= -1e-12;
  };
  let checked = 0;
  for (let i = 1; i < 8; i++) {
    for (let j = 1; j < 8; j++) {
      for (let k = 1; k < 8; k++) {
        const fx = i / 8;
        const fy = j / 8;
        const fz = k / 8;
        assert.ok(contains(fx, fy, fz, tetIndexOf(fx, fy, fz)), `(${fx},${fy},${fz}) is not inside tetrahedron ${tetIndexOf(fx, fy, fz)}`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 300);

  // The cell-phase arithmetic itself: a point ON a grid corner is at distance 0
  // from a corner, an edge and a plane; the cell centre is the farthest point.
  const unitBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 }, size: { x: 1, y: 1, z: 1 }, longest: 1 };
  const corner = cellPhaseOf({ x: 0.25, y: 0.5, z: 0.75 }, unitBounds, 0.25);
  assert.equal(corner.cornerDistanceSteps, 0);
  assert.equal(corner.edgeDistanceSteps, 0);
  assert.equal(corner.planeDistanceSteps, 0);
  const centre = cellPhaseOf({ x: 0.125, y: 0.375, z: 0.625 }, unitBounds, 0.25);
  assert.ok(Math.abs(centre.cornerDistanceSteps - Math.hypot(0.5, 0.5, 0.5)) < 1e-12);
  assert.ok(Math.abs(centre.edgeDistanceSteps - Math.hypot(0.5, 0.5)) < 1e-12);
  assert.ok(Math.abs(centre.planeDistanceSteps - 0.5) < 1e-12);
  assert.equal(centre.onTetFace, true, "the cell centre ties on all three coordinates and must say so");
});

test("P25-10: the grid-free connectivity control brackets the material's TRUE component count without any grid at all", () => {
  // A unit's own capsule chain is connected by construction, so the union is
  // connected exactly when the unit-overlap graph is. Overlaps are certificates;
  // separations are only bounded — hence a bracket, never a single number.
  const run = p24Runs.get("sphere")!;
  const c = measureUnionConnectivity(run.result, 8);
  assert.equal(c.unitCount, run.result.units.length);
  assert.ok(c.pairsMeasured >= c.provenOverlappingPairs + c.ambiguousPairs + c.provenSeparatedPairs - 0);
  assert.equal(c.provenOverlappingPairs + c.ambiguousPairs + c.provenSeparatedPairs, c.pairsMeasured, "every measured pair must land in exactly one of the three buckets");
  // The bracket is a bracket: joining more edges can only merge components.
  assert.ok(c.componentLowerBound <= c.componentUpperBound);
  // Restricting overlaps to those surviving the plate clip can only split.
  assert.ok(c.componentUpperBoundAbovePlate >= c.componentUpperBound);
  assert.equal(c.upperBoundComponentSizes.reduce((s, v) => s + v, 0), c.unitCount, "the component sizes must account for every unit");
  // MEASURED, 2026-07-27: the material of this candidate is ONE connected solid,
  // proven by overlap certificates alone — no ambiguous pair is needed and none
  // of the 287 parent-child edges is unproven. Pinned because the whole P25
  // verdict turns on it: every meshed component past the first is the grid's.
  assert.equal(c.componentUpperBound, 1, "sphere's material is no longer provably one connected solid — re-measure before reading any component count as fragmentation");
  assert.equal(c.componentLowerBound, 1);
  assert.equal(c.componentUpperBoundAbovePlate, 1);
  assert.equal(c.parentChildEdgesNotProvenOverlapping, 0);
  assert.ok(c.maxSamplingErrorFieldUnits > 0, "a sampled gap without a stated error bound would be a claim of exactness");
});

test("P25-11: measureComponentIslands says what a non-largest component is BUILT AROUND — a single isolated grid corner reads as exactly one", () => {
  // Two spheres in a unit box at resolution 8 (step 0.125): a big one that
  // encloses several grid corners, and a tiny one centred exactly ON a corner
  // and smaller than a step, so the mesher can only see that one corner of it.
  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 }, size: { x: 1, y: 1, z: 1 }, longest: 1 };
  const step = fieldStepOf(bounds, 8);
  assert.equal(step, 0.125);
  const field = (x: number, y: number, z: number): number =>
    Math.min(Math.hypot(x - 0.25, y - 0.25, z - 0.25) - 0.15, Math.hypot(x - 0.75, y - 0.75, z - 0.75) - 0.04);
  const mesh = rescaleMeshResult(buildMeshFromField(bounds, field, { resolution: 8, targetLongestMm: 1 }), 1);
  const report = measureComponents(mesh.triangles, 1, { axis: "y", sign: 1, plateOffsetFieldUnits: -1000 }, 0.2);
  assert.equal(report.componentCount, 2, "the fixture is two disjoint spheres");

  const islands = measureComponentIslands(mesh.triangles, report, field, bounds, step);
  assert.equal(islands.stats.length, 1, "only the non-largest component is examined");
  assert.equal(islands.stats[0].rank, 1);
  assert.equal(islands.stats[0].negativeGridCornersInBbox, 1, "the tiny sphere's surface encloses exactly one negative grid corner");
  assert.equal(islands.singleCornerIslands, 1);
  assert.equal(islands.maxCornersInANonLargestComponent, 1);
  assert.ok(islands.stats[0].bboxLongestSteps < 2, `a single-corner island cannot span two cells; got ${islands.stats[0].bboxLongestSteps}`);

  // And the measurement is not blind to a component that is NOT a speck: make
  // the second sphere large enough to hold several corners and the same rank
  // reports several.
  const bigger = (x: number, y: number, z: number): number =>
    Math.min(Math.hypot(x - 0.25, y - 0.25, z - 0.25) - 0.2, Math.hypot(x - 0.75, y - 0.75, z - 0.75) - 0.14);
  const mesh2 = rescaleMeshResult(buildMeshFromField(bounds, bigger, { resolution: 8, targetLongestMm: 1 }), 1);
  const report2 = measureComponents(mesh2.triangles, 1, { axis: "y", sign: 1, plateOffsetFieldUnits: -1000 }, 0.2);
  assert.equal(report2.componentCount, 2);
  const islands2 = measureComponentIslands(mesh2.triangles, report2, bigger, bounds, step);
  assert.ok(
    islands2.stats[0].negativeGridCornersInBbox > 1,
    `a component spanning more than one cell must report more than one corner; got ${islands2.stats[0].negativeGridCornersInBbox}`,
  );
  assert.equal(islands2.singleCornerIslands, 0);
});

test("P25-12: a component COUNT cannot tell a detached piece from an enclosed void — the enclosure classifier can, and is checked against a fixture that has one of each", () => {
  // Fixture: a hollow shell (outer sphere minus a concentric inner sphere) and,
  // far enough away to be a separate component, a small solid ball. The mesh has
  // THREE components — the shell's outer wall, the shell's CAVITY wall, and the
  // ball — and only one of them is a detached piece of material.
  const bounds = { min: { x: -1, y: -1, z: -1 }, max: { x: 3.5, y: 1, z: 1 }, size: { x: 4.5, y: 2, z: 2 }, longest: 4.5 };
  const shell = (x: number, y: number, z: number): number => {
    const r = Math.hypot(x, y, z);
    return Math.max(r - 0.8, 0.45 - r); // solid between radius 0.45 and 0.8
  };
  const ball = (x: number, y: number, z: number): number => Math.hypot(x - 2.5, y, z) - 0.35;
  const field = (x: number, y: number, z: number): number => Math.min(shell(x, y, z), ball(x, y, z));
  const step = fieldStepOf(bounds, 96);
  const mesh = rescaleMeshResult(buildMeshFromField(bounds, field, { resolution: 96, targetLongestMm: 1 }), 1);
  const report = measureComponents(mesh.triangles, 1, { axis: "y", sign: 1, plateOffsetFieldUnits: -1000 }, 0.2);
  assert.equal(report.componentCount, 3, "outer shell wall + cavity wall + detached ball");

  const islands = measureComponentIslands(mesh.triangles, report, field, bounds, step);
  assert.equal(islands.largestEnclosure, "solid-island", "the outer wall of the shell bounds material and must read as one");
  assert.equal(islands.stats.length, 2);
  assert.equal(islands.cavityWallCount, 1, "exactly one of the two non-largest components is the wall of the shell's cavity");
  assert.equal(islands.solidIslandCount, 1, "…and exactly one is the detached ball");
  assert.ok(islands.cavityVolumeMm3 > 0 && islands.solidIslandVolumeMm3 > 0);

  const cavity = islands.stats.find((s) => s.enclosure === "cavity-wall")!;
  const island = islands.stats.find((s) => s.enclosure === "solid-island")!;
  // The signs really are opposite, and they are the ONLY thing separating the
  // two: both are closed, consistently wound, and comparable in size.
  assert.ok(cavity.signedVolumeProxyMm3 < 0, `cavity wall signed volume ${cavity.signedVolumeProxyMm3} should be negative`);
  assert.ok(island.signedVolumeProxyMm3 > 0, `solid island signed volume ${island.signedVolumeProxyMm3} should be positive`);
  assert.equal(cavity.closed, true);
  assert.equal(island.closed, true);
  assert.equal(cavity.windingConsistent, true);
  assert.equal(island.windingConsistent, true);
  // And the corner counts point the same way: the cavity is a pocket of POSITIVE
  // field, the ball is a lump of NEGATIVE field.
  assert.ok(cavity.positiveGridCornersInBbox > 0, "the cavity encloses grid corners that are outside material");
  assert.ok(island.negativeGridCornersInBbox > 0, "the ball encloses grid corners that are inside material");

  // The classifier refuses to read a sign it may not read: after
  // `orientMeshForSavedStl` every component is forced positive (P2.3-12), so the
  // cavity would masquerade as a solid island — which is exactly why the row
  // measures the UN-oriented mesh.
  const oriented = orientMeshForSavedStl(mesh);
  const orientedReport = measureComponents(oriented.triangles, 1, { axis: "y", sign: 1, plateOffsetFieldUnits: -1000 }, 0.2);
  const orientedIslands = measureComponentIslands(oriented.triangles, orientedReport, field, bounds, step);
  assert.equal(orientedIslands.cavityWallCount, 0, "the save orientation erases the distinction — the diagnosis must not be taken after it");
});

console.log(`\n${passed} passed`);

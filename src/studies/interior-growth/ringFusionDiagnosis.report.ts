// ---------------------------------------------------------------------------
// P2.3 ring-fusion diagnosis RUNNER (diagnosis-only, never imported by
// production — `growth.test.ts`'s P2.3-18 crawls the production import graph
// and fails if this file or `ringFusionDiagnosis.ts` becomes reachable).
//
// Run: `npm run diagnose:ring-fusion`
//
// WHY IT IS NOT IN THE TEST SUITE
// The measurement this exists for is the full 3-host / resolution-64 /
// all-components re-measurement, including both EXACT (`unitsPointsSdf`)
// stages and the hard-union mesh. That is ~2-3 minutes per host — far too slow
// for `npm run test:interior-growth`, and the alternative (weakening the
// assertions until it fits) is not on the table. The suite keeps the synthetic
// instrument checks (P2.3-6 … P2.3-18); this script produces the numbers the
// README's Observation quotes.
//
// EVERY NUMBER PRINTED HERE IS A MEASUREMENT, NEVER A VERDICT. Where a
// measurement is inconclusive it is printed as `undetermined`, not rounded into
// one of the two answers.
// ---------------------------------------------------------------------------

import {
  DEFAULT_GROWTH_PARAMS,
  computeDerivedLateralAllowance,
  findPrinterPreset,
  fitHostToBuildVolume,
  type FabricationEnvelope,
  type HostFixtureId,
} from "./field.ts";
import { growNetwork, type GrowthResult } from "./growth.ts";
import { buildCandidateMesh } from "./meshExport.ts";
import {
  BLEND_K_SWEEP_MULTIPLIERS,
  EDGE_CONTACT_CLASSES,
  FIELD_STAGES,
  HARD_UNION_BLEND_K,
  accountHardUnionFragmentation,
  boundsAroundComponent,
  buildHardUnionStageMesh,
  buildStageMesh,
  classifyComponentHardOverlap,
  compareStageComponentIdentity,
  compareSubsetSteps,
  componentTriangles,
  decomposeExactIndexedDifference,
  measureAllEdges,
  measureBlendKSweep,
  measureComponentHardOverlap,
  measureComponents,
  measureExactIndexedTopologyAttribution,
  measureFoldFidelity,
  measureHardUnionMesh,
  measureOrderDependence,
  measureWholeMeshFragmentation,
  measureSmoothVsHardOrdering,
  partitionExactIndexedPopulations,
  type AllEdgeReport,
  type ComponentHardOverlap,
  type ComponentReport,
} from "./ringFusionDiagnosis.ts";

/** Production save-path resolution (growth.test.ts §11-11 idiom). */
const RESOLUTION = 64;
/**
 * Grid densities the volumetric hard-overlap measurement is run at: cells across
 * each component's OWN longest bbox edge. Two of them, so a verdict that flips
 * with resolution shows up as non-converged instead of being quoted.
 */
const DENSITIES = [20, 32] as const;
const HOSTS: HostFixtureId[] = ["box", "sphere", "waisted"];

function conditions(hostId: HostFixtureId) {
  const preset = findPrinterPreset("bambu-a1-mini");
  const buildAxis = { x: 0, y: 1, z: 0 };
  const layerHeightMm = 0.2;
  const supportThresholdAngleDeg = 30;
  const envelope: FabricationEnvelope = {
    buildAxis,
    layerHeightMm,
    supportThresholdAngleDeg,
    derivedMaxLateralAdvancePerLayerMm: computeDerivedLateralAllowance(layerHeightMm, supportThresholdAngleDeg),
  };
  const fit = fitHostToBuildVolume(hostId, buildAxis, preset.buildVolumeMm);
  return { envelope, fit, params: { ...DEFAULT_GROWTH_PARAMS, targetSurfaceCoverage: 0.25 } };
}

function n(value: number, digits = 3): string {
  return value.toFixed(digits);
}

/**
 * The only place this script turns numbers into words, and it refuses to when
 * the two densities disagree. "undetermined" is a first-class outcome, not a
 * failure to be rounded away.
 *
 * P2.4: the rules moved into `classifyComponentHardOverlap` so the P2.4 order
 * matrix and blendK sweep classify by the SAME rule this report does, instead of
 * a second copy of it that could drift. The thresholds are unchanged — including
 * the 20% ambiguous-band share, now `HARD_OVERLAP_AMBIGUOUS_SHARE_LIMIT`.
 */
const verdictOf = classifyComponentHardOverlap;

function printComponentOverlap(label: string, o: ComponentHardOverlap): void {
  console.log(
    `  ${label} rank ${o.rank}: tris ${o.triangleCount}, signed vol ${n(o.signedVolumeProxyMm3)}mm³, |vol| ${n(o.absoluteVolumeProxyMm3)}mm³, ` +
      `build-axis ${n(o.axisMinMm, 1)}–${n(o.axisMaxMm, 1)}mm, bbox longest ${n(o.bboxLongestMm, 2)}mm, ` +
      `closed=${o.surface.closed} winding=${o.surface.windingConsistent}`,
  );
  console.log(
    `      OLD surface-vertex criterion: ${n(o.surfaceVertexInsideFraction * 100, 2)}% of ${o.surfaceVertexCount} vertices hard-negative ` +
      `(min hard SDF at a vertex ${n(o.minHardSdfAtSurfaceVertex, 5)}) — see P2.3-8, this number cannot distinguish anything`,
  );
  for (const g of o.grids) {
    console.log(
      `      N=${g.samplesPerLongestEdge}: inside ${g.insideCells}/${g.totalCells} cells (${n(g.insideVolumeMm3, 2)}mm³) | ` +
        `hard-neg ${g.hardNegativeInsideCells} (${n(g.hardNegativeInsideVolumeMm3, 3)}mm³) | ` +
        `ambiguous ${g.ambiguousInsideCells} (${n(g.ambiguousInsideVolumeMm3, 3)}mm³) | ` +
        `hard-pos ${g.hardPositiveInsideCells} (${n(g.hardPositiveInsideVolumeMm3, 3)}mm³) | ` +
        `min hard inside ${g.minHardSdfInside === null ? "n/a" : n(g.minHardSdfInside, 4)} | eps ${n(g.epsilonFieldUnits, 5)}`,
    );
  }
  console.log(`      densities agree: ${o.densitiesAgree} -> ${verdictOf(o)}`);
}

function stageTable(result: GrowthResult, blendK: number, plateReference: NonNullable<ReturnType<typeof buildCandidateMesh>["plateReference"]>, layerHeightMm: number): Map<string, ComponentReport> {
  const rows = new Map<string, ComponentReport>();
  for (const stage of FIELD_STAGES) {
    const mesh = buildStageMesh(result, stage, RESOLUTION, blendK);
    rows.set(stage, measureComponents(mesh.triangles, mesh.scaleMmPerUnit, plateReference, layerHeightMm));
  }
  return rows;
}

function runHost(hostId: HostFixtureId): void {
  const started = Date.now();
  const { envelope, fit, params } = conditions(hostId);
  const result = growNetwork(hostId, envelope, params, "ring-constrained", fit.scaleMmPerUnit);
  const blendK = result.params.unitRadius * 0.3;
  const layerHeightMm = envelope.layerHeightMm;
  const mesh = buildCandidateMesh(result, RESOLUTION, blendK);
  const plateReference = mesh.plateReference!;
  const report = measureComponents(mesh.triangles, mesh.scaleMmPerUnit, plateReference, layerHeightMm);

  console.log(`\n${"=".repeat(78)}\n== ${hostId} — ring-constrained, ${result.units.length} units, resolution ${RESOLUTION}, blendK ${n(blendK, 4)}`);
  console.log(`${"=".repeat(78)}`);
  console.log(`graph roots: ${result.rootCount} | saved mesh: ${report.triangleCount} triangles, ${report.componentCount} components`);

  // --- the ordering that invalidates the old criterion ---------------------
  const ordering = measureSmoothVsHardOrdering(result, blendK, 20);
  console.log(
    `\n[correction 1] smooth vs hard ordering over ${ordering.compared} lattice points: ` +
      `blended>hard at ${ordering.blendedAboveHardCount} points, max(blended-hard) ${n(ordering.maxBlendedMinusHard, 6)}, ` +
      `max(hard-blended) ${n(ordering.maxHardMinusBlended, 4)} field units`,
  );

  // --- stage table ---------------------------------------------------------
  const stages = stageTable(result, blendK, plateReference, layerHeightMm);
  console.log("\n[stage table] component counts");
  for (const [stage, r] of stages) console.log(`  ${stage.padEnd(20)} ${r.componentCount} components, ${r.triangleCount} triangles`);
  console.log(`  ${"saved-mesh".padEnd(20)} ${report.componentCount} components, ${report.triangleCount} triangles`);

  // --- G: exact-only vs indexed-added --------------------------------------
  const populations = partitionExactIndexedPopulations(result, RESOLUTION, blendK, plateReference, layerHeightMm);
  console.log(
    `\n[correction 7] post-clip EXACT ${populations.exactComponentCount} components vs INDEXED ${populations.indexedComponentCount}: ` +
      `indexed components already present in the exact field: [${populations.indexedSharedRanks.join(", ")}] | ` +
      `ADDED by the indexed sampler: [${populations.indexedAddedRanks.join(", ")}] | ` +
      `exact-only: [${populations.exactOnlyRanks.join(", ")}] | worst pairing distance ${n(populations.maxPairingDistanceMm, 3)}mm`,
  );

  // --- A: the volumetric measurement, per population -----------------------
  const overlapOf = (triangles: typeof mesh.triangles, r: ComponentReport, scale: number, rank: number) =>
    measureComponentHardOverlap(componentTriangles(triangles, r, rank), rank, result.units, scale, DENSITIES, plateReference);

  console.log("\n[correction A] volumetric hard-overlap, SAVED mesh (the mesh the gate refuses)");
  const savedOverlaps: ComponentHardOverlap[] = [];
  for (const c of report.components) {
    const o = overlapOf(mesh.triangles, report, mesh.scaleMmPerUnit, c.rank);
    savedOverlaps.push(o);
    printComponentOverlap("saved", o);
  }

  console.log("\n[correction 7 + A] the same measurement kept SEPARATE per population, on the post-clip meshes");
  console.log("  -- population 1: components present in the EXACT field --");
  for (const c of populations.exactReport.components) {
    if (c.rank === 0) continue;
    printComponentOverlap("exact", overlapOf(populations.exactMesh.triangles, populations.exactReport, populations.exactMesh.scaleMmPerUnit, c.rank));
  }
  console.log("  -- population 2: components the INDEXED sampler ADDS --");
  if (populations.indexedAddedRanks.length === 0) console.log("    (none at this resolution)");
  for (const rank of populations.indexedAddedRanks) {
    printComponentOverlap("indexed-added", overlapOf(populations.indexedMesh.triangles, populations.indexedReport, populations.indexedMesh.scaleMmPerUnit, rank));
  }

  // --- F: the full hard-union mesh -----------------------------------------
  const hard = measureHardUnionMesh(result, mesh.triangles, report, RESOLUTION, blendK, plateReference, layerHeightMm, 24);
  console.log(`\n[correction 2.3] HARD-union mesh (blendK -> ${0}) at the SAME bounds and resolution: ${hard.report.componentCount} components`);
  for (const c of hard.report.components) {
    const contain = hard.containment.find((x) => x.hardRank === c.rank)!;
    console.log(
      `  hard rank ${c.rank}: tris ${c.triangleCount}, signed vol ${n(c.signedVolumeProxyMm3)}mm³, ` +
        `build-axis ${n(c.axisMinMm, 1)}–${n(c.axisMaxMm, 1)}mm, plate ${c.touchesPlate} | ` +
        `interior cells ${contain.insideCells} (${n(contain.insideVolumeMm3, 2)}mm³), in no smooth component ${contain.cellsInNoSmoothComponent} | ` +
        `smooth ranks by volume: ${contain.bySmoothRank.map((s) => `${s.smoothRank}:${n(s.volumeMm3, 2)}mm³`).join(" ") || "none"}`,
    );
  }
  console.log(`  smooth components holding hard material (by dominant volume): [${hard.smoothRanksContainingHardMaterial.join(", ")}]`);

  // --- D: identity across the plate clip -----------------------------------
  for (const [before, after] of [["pre-clip-exact", "post-clip-exact"], ["pre-clip-indexed", "post-clip-indexed"]] as const) {
    const identity = compareStageComponentIdentity(result, before, after, RESOLUTION, blendK, plateReference, layerHeightMm);
    const m = identity.matching;
    console.log(
      `\n[correction 3] ${before} -> ${after}: ${m.beforeCount} -> ${m.afterCount} components, count preserved ${m.countPreserved}, ` +
        `IDENTITY preserved ${m.identityPreserved} | byte-identical ${m.identicalPairs.length} | changed ${m.changedPairs.length} | ` +
        `disappeared [${m.disappearedBeforeRanks.join(", ")}] | appeared [${m.appearedAfterRanks.join(", ")}]`,
    );
    for (const p of m.changedPairs) {
      console.log(
        `    ${p.beforeRank} -> ${p.afterRank}: centre moved ${n(p.centreDistanceMm, 3)}mm, tris ${p.triangleCountDelta >= 0 ? "+" : ""}${p.triangleCountDelta}, ` +
          `signed vol ${n(p.signedVolumeDeltaMm3, 3)}mm³, axis min ${n(p.axisMinDeltaMm, 3)}mm, bbox corner ${n(p.bboxCornerMaxDeltaMm, 3)}mm`,
      );
    }
  }

  // --- E: subset at the production-equivalent step -------------------------
  const byId = new Map(result.units.map((u) => [u.id, u]));
  const child = result.units.find((u) => u.parentId !== null && byId.has(u.parentId!));
  if (child) {
    const parent = byId.get(child.parentId!)!;
    const cmp = compareSubsetSteps(result, [parent, child], 48, RESOLUTION, blendK, layerHeightMm);
    console.log(
      `\n[correction 5] parent ${parent.id} + child ${child.id} subset. Full candidate step ${n(cmp.fullStepFieldUnits, 5)} field units ` +
        `(${n(cmp.fullStepMm, 4)}mm); production-equivalent row clamped: ${cmp.productionEquivalentClamped}`,
    );
    for (const row of cmp.rows) {
      console.log(
        `    ${row.label.padEnd(28)} resolution ${row.counts.requestedResolution} -> ${row.counts.effectiveResolution}, ` +
          `step ${n(row.counts.stepFieldUnits, 5)} (${n(row.stepRatioToFullCandidate, 3)}× full) | ` +
          `pre-clip ${row.counts.preClipComponentCount} components, post-clip ${row.counts.postClipComponentCount}`,
      );
    }
  }

  // --- the tally the README quotes -----------------------------------------
  const nonLargest = savedOverlaps.filter((o) => o.rank > 0);
  const tally = { "contains-hard-material": 0, "no-hard-material-found": 0, undetermined: 0 };
  for (const o of nonLargest) tally[verdictOf(o)]++;
  console.log(
    `\n[tally] ${hostId}: ${nonLargest.length} non-largest components — ` +
      `contains hard material ${tally["contains-hard-material"]}, ` +
      `blend-only (no hard material found) ${tally["no-hard-material-found"]}, ` +
      `undetermined ${tally.undetermined}`,
  );
  console.log(`[${hostId} took ${n((Date.now() - started) / 1000, 1)}s]`);
}

// ===========================================================================
// P2.4 SECTIONS (2026-07-27)
//
// Four measurement matrices the P2.3 round left open. They are heavy — the
// EXACT union costs ~30s per mesh at production resolution — so the runner
// takes `--sections=` and `--hosts=` so one matrix can be run on its own
// instead of the whole ~45 minutes. With no arguments EVERYTHING runs, which is
// what produces the numbers the README quotes.
//
//   --sections=p23,order,blendk,edges,exact-indexed
//   --hosts=box,sphere,waisted
// ===========================================================================

const ALL_SECTIONS = ["p23", "order", "blendk", "edges", "exact-indexed"] as const;
type Section = (typeof ALL_SECTIONS)[number];

// This repository deliberately has no `@types/node` (see vite.config.ts), and
// `src/test-node-shim.d.ts` declares only the subset the TESTS use. This script
// is not a test and is not covered by that shim's `argv`, so the one property it
// reads is declared here, module-scoped — the same "declare only what is
// actually used" rule the shim itself follows.
declare const process: { argv: string[] };

function argValue(name: string): string | null {
  const hit = process.argv.slice(2).find((a: string) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const sectionArg = argValue("sections");
const SECTIONS: Section[] = sectionArg
  ? sectionArg.split(",").map((s) => s.trim()).filter((s): s is Section => (ALL_SECTIONS as readonly string[]).includes(s))
  : [...ALL_SECTIONS];
const hostArg = argValue("hosts");
const SELECTED_HOSTS: HostFixtureId[] = hostArg
  ? (hostArg.split(",").map((s) => s.trim()) as HostFixtureId[]).filter((h) => HOSTS.includes(h))
  : HOSTS;

/**
 * Lattice for every field-level comparison in the P2.4 sections: cells per axis
 * over the candidate's own sampling box. 20³ = 8000 points. Fixed here so every
 * §1 and §2 number in one run is taken at the same sampling.
 */
const P24_LATTICE = 20;
/** Samples per capsule segment for the all-edge gap measurement. */
const P24_GAP_SAMPLES = 17;

function grown(hostId: HostFixtureId) {
  const { envelope, fit, params } = conditions(hostId);
  const result = growNetwork(hostId, envelope, params, "ring-constrained", fit.scaleMmPerUnit);
  const blendK = result.params.unitRadius * 0.3;
  const mesh = buildCandidateMesh(result, RESOLUTION, blendK);
  const plateReference = mesh.plateReference!;
  const report = measureComponents(mesh.triangles, mesh.scaleMmPerUnit, plateReference, envelope.layerHeightMm);
  return { result, blendK, mesh, plateReference, report, layerHeightMm: envelope.layerHeightMm, preset: findPrinterPreset("bambu-a1-mini") };
}

// --- §1: order dependence ---------------------------------------------------

function runOrderSection(hostId: HostFixtureId): void {
  const started = Date.now();
  const { result, blendK, plateReference, layerHeightMm } = grown(hostId);
  console.log(`\n${"=".repeat(78)}\n== §1 ORDER DEPENDENCE — ${hostId}, ${result.units.length} units, resolution ${RESOLUTION}, blendK ${n(blendK, 5)}`);
  console.log(`${"=".repeat(78)}`);
  const order = measureOrderDependence(result, {
    resolution: RESOLUTION,
    blendK,
    lattice: P24_LATTICE,
    hardOverlapDensities: DENSITIES,
    includeExactForm: true,
    layerHeightMm,
    plateReference,
  });
  const f = order.fidelity;
  console.log(
    `[precondition] the order-explicit folds reproduce the shipped unions: exact mismatches ${f.exactMismatches}/${f.latticeCompared} ` +
      `(max |diff| ${f.maxAbsExactDifference}), indexed mismatches ${f.indexedMismatches}/${f.latticeCompared} (max |diff| ${f.maxAbsIndexedDifference})`,
  );
  if (f.exactMismatches !== 0 || f.indexedMismatches !== 0) {
    console.log("  !! the instrument does not reproduce the shipped union — every row below is measuring the instrument. STOP.");
  }
  console.log(`\n  ${"condition".padEnd(34)} ${"perm?".padEnd(6)} ${"signDis".padEnd(8)} ${"maxΔfield".padEnd(11)} ${"comps".padEnd(6)} ${"ident".padEnd(6)} ${"worstPairMm".padEnd(12)} ${"|vol|mm³".padEnd(11)} ${"blendOnly".padEnd(10)} ${"undet".padEnd(6)} ms`);
  for (const r of order.rows) {
    console.log(
      `  ${r.label.padEnd(34)} ${(r.permutationDiffersFromNatural ? `d${r.maxCanonicalDisplacement}` : "same").padEnd(6)} ` +
        `${String(r.signDisagreementsVsNatural).padEnd(8)} ${n(r.maxAbsFieldDifferenceVsNatural, 8).padEnd(11)} ` +
        `${String(r.componentCount).padEnd(6)} ${String(r.identityPreservedVsNatural).padEnd(6)} ${n(r.worstPairingDistanceMm, 3).padEnd(12)} ` +
        `${n(r.totalAbsoluteVolumeProxyMm3, 2).padEnd(11)} ` +
        `${String(r.hardTally ? `${r.hardTally.blendOnly} (${n(r.hardTally.blendOnlyVolumeMm3, 1)}mm³)` : "n/a").padEnd(10)} ` +
        `${String(r.hardTally?.undetermined ?? "n/a").padEnd(6)} ${r.buildMs}`,
    );
    if (r.signDisagreementsVsNatural > 0) {
      console.log(`      max |natural| at a sign disagreement: ${n(r.maxAbsNaturalAtSignDisagreement, 8)} field units`);
    }
    if (!r.identityPreservedVsNatural) {
      console.log(
        `      identity: ${r.identicalPairCount} identical, ${r.changedPairCount} changed, ${r.disappearedCount} disappeared, ${r.appearedCount} appeared`,
      );
    }
    console.log(`      bbox ${n(r.bboxMinMm.x, 2)},${n(r.bboxMinMm.y, 2)},${n(r.bboxMinMm.z, 2)} .. ${n(r.bboxMaxMm.x, 2)},${n(r.bboxMaxMm.y, 2)},${n(r.bboxMaxMm.z, 2)} mm`);
  }
  console.log(
    `\n  VERDICT ${hostId}: order-dependent = ${order.orderDependent}` +
      (order.orderDependent ? ` — rows [${order.orderDependentLabels.join(", ")}]` : "") +
      ` | component-count spread exact ${order.componentCountSpreadExact}, indexed ${order.componentCountSpreadIndexed}` +
      ` | largest field difference any permuted row ${n(order.maxAbsFieldDifferenceAnyRow, 8)} field units` +
      ` | largest sign-disagreement count ${order.maxSignDisagreementsAnyRow}/${order.rows[0]?.latticeCompared ?? 0}`,
  );
  console.log(`[§1 ${hostId} took ${n((Date.now() - started) / 1000, 1)}s]`);
}

// --- §2: the blendK sweep ---------------------------------------------------

function runBlendKSection(hostId: HostFixtureId): void {
  const started = Date.now();
  const { result, blendK, preset } = grown(hostId);
  console.log(`\n${"=".repeat(78)}\n== §2 blendK SWEEP — ${hostId}, ${result.units.length} units, resolution ${RESOLUTION}`);
  console.log(`${"=".repeat(78)}`);
  console.log(
    `production blendK ${n(blendK, 5)} = params.unitRadius (${n(result.params.unitRadius, 5)}) × 0.3 | ` +
      `canonical scale ${n(result.canonicalScaleMmPerUnit, 3)}mm/unit | build volume ${preset.buildVolumeMm.x}×${preset.buildVolumeMm.y}×${preset.buildVolumeMm.z}mm | ` +
      `measured surface coverage ${n(result.measuredSurfaceCoverage, 4)}`,
  );
  console.log("(the multipliers are a SEARCH DEVICE for this diagnosis — no author-facing control is added for them)");
  const sweep = measureBlendKSweep(result, {
    resolution: RESOLUTION,
    multipliers: BLEND_K_SWEEP_MULTIPLIERS,
    lattice: P24_LATTICE,
    hardOverlapDensities: DENSITIES,
    includeExactIndexedIdentity: true,
    buildVolumeMm: preset.buildVolumeMm,
  });
  console.log(
    `\n  ${"×".padEnd(6)} ${"blendK".padEnd(9)} ${"hard".padEnd(6)} ${"smooth".padEnd(7)} ${"saved".padEnd(6)} ${"blendOnly".padEnd(10)} ${"undet".padEnd(6)} ` +
      `${"smoothOnly mm³".padEnd(15)} ${"outward mm".padEnd(11)} ${"lowest mm".padEnd(10)} ${"exact/idx".padEnd(10)} ${"ident".padEnd(6)} ${"pairMm".padEnd(9)} ms`,
  );
  for (const p of sweep.points) {
    console.log(
      `  ${n(p.multiplier, 2).padEnd(6)} ${n(p.blendK, 5).padEnd(9)} ${String(p.hardComponentCount).padEnd(6)} ${String(p.smoothComponentCount).padEnd(7)} ` +
        `${String(p.savedMeshComponentCount).padEnd(6)} ${String(p.hardTally?.blendOnly ?? "n/a").padEnd(10)} ${String(p.hardTally?.undetermined ?? "n/a").padEnd(6)} ` +
        `${n(p.smoothOnly.smoothOnlyVolumeMm3, 2).padEnd(15)} ${n(p.maxOutwardDistanceProxyMm, 4).padEnd(11)} ${n(p.savedMeshLowestBuildAxisMm, 4).padEnd(10)} ` +
        `${`${p.exactComponentCount}/${p.indexedComponentCount}`.padEnd(10)} ${String(p.exactIndexedIdentityPreserved).padEnd(6)} ` +
        `${n(p.exactIndexedMaxPairingDistanceMm ?? 0, 3).padEnd(9)} ${p.meshMs}`,
    );
    console.log(
      `        bounds longest ${n(p.boundsLongestFieldUnits, 5)} field units, step ${n(p.stepFieldUnits, 6)} (${n(p.stepMm, 4)}mm) | ` +
        `saved: ${p.savedMeshTriangleCount} tris, closed=${p.savedMeshClosed}, winding=${p.savedMeshWindingConsistent}, open edges ${p.savedMeshOpenEdges}, non-manifold ${p.savedMeshNonManifoldEdges}`,
    );
    console.log(
      `        saved bbox ${n(p.savedMeshBboxMinMm.x, 2)},${n(p.savedMeshBboxMinMm.y, 2)},${n(p.savedMeshBboxMinMm.z, 2)} .. ` +
        `${n(p.savedMeshBboxMaxMm.x, 2)},${n(p.savedMeshBboxMaxMm.y, 2)},${n(p.savedMeshBboxMaxMm.z, 2)}mm | ` +
        `lattice cells inside smooth ${p.smoothOnly.insideSmoothCells}, inside hard ${p.smoothOnly.insideHardCells}, hard-only ${p.smoothOnly.hardOnlyCells} (must be 0) | ` +
        `blended>hard at ${p.ordering.blendedAboveHardCount} points | coverage ${n(p.measuredSurfaceCoverage, 4)}`,
    );
    if (p.exactIndexedAddedRanks && p.exactIndexedAddedRanks.length > 0) {
      console.log(`        indexed-added component ranks: [${p.exactIndexedAddedRanks.join(", ")}]`);
    }
  }
  console.log(
    `\n  ANSWER ${hostId}: multipliers with NO blend-only component AND an exact/indexed identity match: ` +
      `[${sweep.multipliersWithNoBlendOnlyAndIdentityMatch.join(", ") || "none"}]`,
  );
  console.log(`[§2 ${hostId} took ${n((Date.now() - started) / 1000, 1)}s]`);
}

// --- §3: every parent-child edge -------------------------------------------

function printEdgeReport(label: string, edges: AllEdgeReport, hardComponentCount: number): void {
  console.log(
    `\n  [${label}] ${edges.edgeCount} edges, ${edges.unitCount} units, full candidate step ${n(edges.fullStepFieldUnits, 6)} field units (${n(edges.fullStepMm, 4)}mm), ` +
      `bounds blendK ${n(edges.boundsBlendK, 5)}, field blendK ${edges.fieldBlendK < 1e-6 ? edges.fieldBlendK.toExponential(0) : n(edges.fieldBlendK, 5)}`,
  );
  for (const cls of EDGE_CONTACT_CLASSES) console.log(`    ${cls.padEnd(46)} ${edges.countByClass[cls]}`);
  const total = EDGE_CONTACT_CLASSES.reduce((s, c) => s + edges.countByClass[c], 0);
  console.log(`    ${"TOTAL".padEnd(46)} ${total}  (must equal ${edges.edgeCount})`);
  console.log(
    `    edges NOT meshing as one component at the production step: ${edges.severedAtProductionStep} | ` +
      `units fragmenting ALONE (within-ring): ${edges.unitsFragmentingAlone.length}, excess pieces ${edges.withinUnitFragmentExcess}`,
  );
  const acct = accountHardUnionFragmentation(hardComponentCount, edges);
  console.log(
    `    accounting: 1 + severed ${acct.severedEdges} + within-unit excess ${acct.withinUnitFragmentExcess} = predicted ${acct.predictedComponentCount} ` +
      `vs measured hard-union ${acct.hardUnionComponentCount} => residual ${acct.residual}`,
  );
  const gaps = edges.edges.map((e) => e.gap.sampledMinSignedGapMm).sort((a, b) => a - b);
  const necks = edges.edges.map((e) => e.neckWidthOverProductionStep).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const pick = (arr: number[], q: number) => (arr.length === 0 ? NaN : arr[Math.min(arr.length - 1, Math.floor(q * arr.length))]);
  console.log(
    `    sampled min signed gap (mm): min ${n(pick(gaps, 0), 4)}, p25 ${n(pick(gaps, 0.25), 4)}, median ${n(pick(gaps, 0.5), 4)}, p75 ${n(pick(gaps, 0.75), 4)}, max ${n(gaps[gaps.length - 1] ?? NaN, 4)}`,
  );
  console.log(
    `    neck width / production step: min ${n(pick(necks, 0), 3)}, median ${n(pick(necks, 0.5), 3)}, max ${n(necks[necks.length - 1] ?? NaN, 3)} ` +
      `(below ~1 the mesher has no grid corner inside the neck) | lens necks ${necks.length}/${edges.edgeCount}`,
  );
  const tubes = edges.edges.map((e) => e.tubeDiameterOverProductionStep).filter((v): v is number => v !== null).sort((a, b) => a - b);
  console.log(
    `    TUBE diameter / production step: min ${n(pick(tubes, 0), 3)}, median ${n(pick(tubes, 0.5), 3)}, max ${n(tubes[tubes.length - 1] ?? NaN, 3)} ` +
      `— a different question from the neck ratio above, and the one that decides whether a STRAIGHT run of tube survives the grid at all`,
  );
  const worst = [...edges.edges].sort((a, b) => b.gap.sampledMinSignedGapMm - a.gap.sampledMinSignedGapMm).slice(0, 5);
  for (const e of worst) {
    console.log(
      `      widest-gap edge ${e.parentId}->${e.childId}: gap ${n(e.gap.sampledMinSignedGapMm, 4)}mm ±${n(e.gap.samplingErrorBoundFieldUnits * (edges.fullStepMm / edges.fullStepFieldUnits), 4)}mm, ` +
        `neck ${e.neckWidthMm === null ? `none (${e.gap.neckState})` : `${n(e.neckWidthMm, 4)}mm`}, ` +
        `neck/tube ${e.neckWidthOverTubeRadius === null ? "n/a" : n(e.neckWidthOverTubeRadius, 3)}, neck/step ${e.neckWidthOverProductionStep === null ? "n/a" : n(e.neckWidthOverProductionStep, 3)}, ` +
        `subset res ${e.productionEquivalentResolution} (step ratio ${n(e.stepRatioToFullCandidate, 3)}), pre-clip ${e.preClipComponentCount} / post-clip ${e.postClipComponentCount}, ${e.classification}`,
    );
    if (e.gap.closestPointA && e.gap.closestPointB) {
      console.log(
        `        closest pair: parent element ${e.gap.closestElementIndexA} sample ${e.gap.closestSampleIndexA} at ` +
          `(${n(e.gap.closestPointA.x, 4)}, ${n(e.gap.closestPointA.y, 4)}, ${n(e.gap.closestPointA.z, 4)}) r=${n(e.gap.closestRadiusA ?? 0, 5)} | ` +
          `child element ${e.gap.closestElementIndexB} sample ${e.gap.closestSampleIndexB} at ` +
          `(${n(e.gap.closestPointB.x, 4)}, ${n(e.gap.closestPointB.y, 4)}, ${n(e.gap.closestPointB.z, 4)}) r=${n(e.gap.closestRadiusB ?? 0, 5)} | ` +
          `centre distance ${n(e.gap.closestCentreDistanceFieldUnits ?? 0, 5)} field units`,
      );
    }
  }
}

function printWholeMeshFragmentation(label: string, w: ReturnType<typeof measureWholeMeshFragmentation>): void {
  console.log(
    `\n    [whole-mesh fragmentation: ${label}] ${w.componentCount} components over ${w.unitCount} units and ${w.edgeCount} edges ` +
      `(a unit's triangles must be >= ${n(w.minComponentShare * 100, 0)}% of its own to count as one of its components)`,
  );
  console.log(
    `      WITHIN-unit (within-ring): ${w.unitsSpanningMultipleComponents.length} units span more than one component, ` +
      `max components per unit ${w.maxComponentsPerUnit}, excess pieces ${w.withinUnitExcess} | units no triangle was assigned to: ${w.unassignedUnitCount}`,
  );
  console.log(`      BETWEEN parent and child: ${w.severedEdgeCount} edges whose two units sit in different components`);
  if (w.severedEdgeCountByContactClass) {
    for (const cls of EDGE_CONTACT_CLASSES) console.log(`        of which ${cls.padEnd(46)} ${w.severedEdgeCountByContactClass[cls]}`);
  }
  console.log(`      components no unit claims a majority of: ${w.componentsWithNoDominantUnit.length} [${w.componentsWithNoDominantUnit.slice(0, 20).join(", ")}]`);
  console.log(
    `      accounting: 1 + between ${w.severedEdgeCount} + within ${w.withinUnitExcess} = predicted ${w.predictedComponentCount} ` +
      `vs measured ${w.componentCount} => residual ${w.residual}`,
  );
  for (const e of w.severedEdges.slice(0, 10)) {
    console.log(`        severed edge ${e.parentId}(rank ${e.parentComponentRank}) -> ${e.childId}(rank ${e.childComponentRank}), contact class: ${e.contactClass ?? "n/a"}`);
  }
}

function contactClassMap(edges: AllEdgeReport): Map<string, ReturnType<typeof measureAllEdges>["edges"][number]["classification"]> {
  return new Map(edges.edges.map((e) => [`${e.parentId}>${e.childId}`, e.classification]));
}

function runEdgeSection(hostId: HostFixtureId): void {
  const started = Date.now();
  const { result, blendK, mesh, plateReference, report, layerHeightMm } = grown(hostId);
  console.log(`\n${"=".repeat(78)}\n== §3 EVERY PARENT-CHILD EDGE — ${hostId}`);
  console.log(`${"=".repeat(78)}`);
  const hardMesh = buildHardUnionStageMesh(result, RESOLUTION, blendK, true);
  const hardReport = measureComponents(hardMesh.triangles, hardMesh.scaleMmPerUnit, plateReference, layerHeightMm);
  console.log(`smooth saved mesh: ${report.componentCount} components | HARD union mesh at the same bounds/resolution: ${hardReport.componentCount} components`);

  const smoothEdges = measureAllEdges(result, {
    resolution: RESOLUTION,
    boundsBlendK: blendK,
    gapSamplesPerSegment: P24_GAP_SAMPLES,
    layerHeightMm,
    includeUnitsAlone: true,
  });
  printEdgeReport("SMOOTH field (production blendK) — what the saved mesh sees", smoothEdges, report.componentCount);
  printWholeMeshFragmentation(
    "the SAVED smooth mesh",
    measureWholeMeshFragmentation(result, mesh.triangles, report, contactClassMap(smoothEdges)),
  );

  const hardEdges = measureAllEdges(result, {
    resolution: RESOLUTION,
    boundsBlendK: blendK,
    fieldBlendK: HARD_UNION_BLEND_K,
    gapSamplesPerSegment: P24_GAP_SAMPLES,
    layerHeightMm,
    includeUnitsAlone: true,
  });
  printEdgeReport("HARD field (blendK -> 0, SAME bounds and step) — what makes the hard union 27/12/20", hardEdges, hardReport.componentCount);
  printWholeMeshFragmentation(
    "the HARD-union mesh — THE 27/12/20 BREAKDOWN",
    measureWholeMeshFragmentation(result, hardMesh.triangles, hardReport, contactClassMap(hardEdges)),
  );
  console.log(`[§3 ${hostId} took ${n((Date.now() - started) / 1000, 1)}s]`);
}

// --- §4: the exact/indexed identity gap ------------------------------------

function runExactIndexedSection(hostId: HostFixtureId): void {
  const started = Date.now();
  const { result, blendK, plateReference, layerHeightMm } = grown(hostId);
  console.log(`\n${"=".repeat(78)}\n== §4 EXACT vs INDEXED IDENTITY GAP — ${hostId}`);
  console.log(`${"=".repeat(78)}`);
  const fidelity = measureFoldFidelity(result, blendK, 12);
  console.log(
    `[precondition] order-explicit folds reproduce the shipped unions: exact ${fidelity.exactMismatches}/${fidelity.latticeCompared} mismatches, ` +
      `indexed ${fidelity.indexedMismatches}/${fidelity.latticeCompared}`,
  );

  const populations = partitionExactIndexedPopulations(result, RESOLUTION, blendK, plateReference, layerHeightMm);
  console.log(
    `\nexact ${populations.exactComponentCount} components vs indexed ${populations.indexedComponentCount} | identity preserved ${populations.matching.identityPreserved} | ` +
      `worst pairing distance ${n(populations.maxPairingDistanceMm, 3)}mm`,
  );
  // `matchComponentSets` pairs GREEDILY by nearest bbox centre once the hashes
  // differ, and when the two counts are equal it will pair the last two
  // leftovers however far apart they are. A pair whose centres are further apart
  // than the two components' own sizes is therefore a PAIRING, not the same
  // component moved — and reading it as a displacement would be the whole error
  // this flag exists to prevent.
  const diagonal = (c: { bboxMinMm: { x: number; y: number; z: number }; bboxMaxMm: { x: number; y: number; z: number } }): number =>
    Math.hypot(c.bboxMaxMm.x - c.bboxMinMm.x, c.bboxMaxMm.y - c.bboxMinMm.y, c.bboxMaxMm.z - c.bboxMinMm.z);
  for (const p of populations.matching.changedPairs) {
    const e = populations.exactReport.components[p.beforeRank];
    const i = populations.indexedReport.components[p.afterRank];
    const reach = (diagonal(e) + diagonal(i)) / 2;
    const suspect = p.centreDistanceMm > reach;
    console.log(
      `  exact rank ${p.beforeRank} (${n(e.absoluteVolumeProxyMm3, 1)}mm³, axis ${n(e.axisMinMm, 1)}–${n(e.axisMaxMm, 1)}mm) -> ` +
        `indexed rank ${p.afterRank} (${n(i.absoluteVolumeProxyMm3, 1)}mm³, axis ${n(i.axisMinMm, 1)}–${n(i.axisMaxMm, 1)}mm): ` +
        `centre moved ${n(p.centreDistanceMm, 3)}mm, tris ${p.triangleCountDelta >= 0 ? "+" : ""}${p.triangleCountDelta}, |vol| ${n(p.absoluteVolumeDeltaMm3, 2)}mm³` +
        `, mean bbox diagonal ${n(reach, 3)}mm${suspect ? "  <-- PAIRING ONLY: the two are further apart than they are large, i.e. these are two DIFFERENT components the equal count forced together" : ""}`,
    );
  }

  const whole = decomposeExactIndexedDifference(result, blendK, P24_LATTICE);
  const printDecomposition = (label: string, d: typeof whole): void => {
    console.log(`\n  [${label}] ${d.compared} lattice points, ${d.totalElements} elements total`);
    console.log(
      `    element SET: query returned fewer than all at ${d.pointsWithReducedElementSet} points ` +
        `(min ${d.minElementsReturned}, mean ${n(d.meanElementsReturned, 1)}, max ${d.maxElementsReturned}) | ` +
        `empty query at ${d.pointsWithEmptyQuery} points (max |diff| there ${n(d.maxAbsTotalDifferenceAtEmptyQuery, 6)})`,
    );
    console.log(
      `    dropped elements that COULD have moved the smooth-min (|own sdf - result| < blendK): ` +
        `${d.totalInfluentialDrops} over ${d.pointsWithInfluentialDrops} points, worst point ${d.maxInfluentialDropsAtAPoint}`,
    );
    console.log(
      `    evaluation ORDER: non-canonical at ${d.pointsWithNonCanonicalOrder} points, max rank displacement ${d.maxRankDisplacement}`,
    );
    console.log(
      `    effect     max|Δ| field units      sign flips\n` +
        `      SET      ${n(d.maxAbsSetEffect, 8).padEnd(22)} ${d.setEffectSignFlips}\n` +
        `      ORDER    ${n(d.maxAbsOrderEffect, 8).padEnd(22)} ${d.orderEffectSignFlips}\n` +
        `      CUTOFF   ${n(d.maxAbsCutoffEffect, 8).padEnd(22)} ${d.cutoffEffectSignFlips}\n` +
        `      TOTAL    ${n(d.maxAbsTotalDifference, 8).padEnd(22)} ${d.totalSignFlips}`,
    );
    console.log(
      `    reconstruction residual (set+order+cutoff - total): ${d.maxReconstructionResidual} | ` +
        `dominant effect at the worst point: ${d.dominantEffectAtWorstPoint} ` +
        `(exact ${n(d.worstExact, 6)}, indexed ${n(d.worstIndexed, 6)}${d.worstPoint ? ` at ${n(d.worstPoint.x, 4)},${n(d.worstPoint.y, 4)},${n(d.worstPoint.z, 4)}` : ""})`,
    );
    console.log(
      `    NOTE: only SIGN FLIPS can change a component. The mesher reads which side of zero each grid corner is on and nothing else.`,
    );
  };
  printDecomposition("whole sampling box", whole);

  // The component the P2.3 round singled out: the exact mesh's rank 1.
  const region = boundsAroundComponent(populations.exactMesh.triangles, populations.exactReport, 1, blendK * 2);
  if (region) {
    console.log(
      `\n  region probe: exact rank 1's own bbox padded by 2×blendK — ${n(region.min.x, 3)},${n(region.min.y, 3)},${n(region.min.z, 3)} .. ` +
        `${n(region.max.x, 3)},${n(region.max.y, 3)},${n(region.max.z, 3)} field units`,
    );
    printDecomposition("exact rank 1's region", decomposeExactIndexedDifference(result, blendK, P24_LATTICE, region));
  }

  const attribution = measureExactIndexedTopologyAttribution(result, RESOLUTION, blendK, plateReference, layerHeightMm);
  console.log(`\n  [topology attribution] the gap split into its SET half and its ORDER half`);
  for (const r of attribution.reports) console.log(`    ${r.field.padEnd(30)} ${r.report.componentCount} components, ${r.report.triangleCount} triangles`);
  console.log(
    `    SET step   (exact-all-canonical -> indexed-set-canonical-order): identity ${attribution.setStep.identityPreserved}, ` +
      `identical ${attribution.setStep.identicalPairs.length}, changed ${attribution.setStep.changedPairs.length}, ` +
      `disappeared ${attribution.setStep.disappearedBeforeRanks.length}, appeared ${attribution.setStep.appearedAfterRanks.length}, ` +
      `worst pairing ${n(attribution.setStepMaxPairingDistanceMm, 3)}mm`,
  );
  console.log(
    `    ORDER step (indexed-set-canonical-order -> indexed-as-shipped): identity ${attribution.orderStep.identityPreserved}, ` +
      `identical ${attribution.orderStep.identicalPairs.length}, changed ${attribution.orderStep.changedPairs.length}, ` +
      `disappeared ${attribution.orderStep.disappearedBeforeRanks.length}, appeared ${attribution.orderStep.appearedAfterRanks.length}, ` +
      `worst pairing ${n(attribution.orderStepMaxPairingDistanceMm, 3)}mm`,
  );
  console.log(
    `    WHOLE gap  (exact-all-canonical -> indexed-as-shipped): worst pairing ${n(attribution.wholeGapMaxPairingDistanceMm, 3)}mm | ` +
      `dominant step: ${attribution.dominantStep}`,
  );
  console.log(`[§4 ${hostId} took ${n((Date.now() - started) / 1000, 1)}s]`);
}

// --- dispatch ---------------------------------------------------------------

console.log("P2.3/P2.4 ring-fusion diagnosis — measurement rounds (2026-07-27)");
console.log(`sections: ${SECTIONS.join(", ")} | hosts: ${SELECTED_HOSTS.join(", ")}`);
console.log(`densities: ${DENSITIES.join(", ")} cells across each component's own longest bbox edge`);
for (const section of SECTIONS) {
  for (const hostId of SELECTED_HOSTS) {
    if (section === "p23") runHost(hostId);
    else if (section === "order") runOrderSection(hostId);
    else if (section === "blendk") runBlendKSection(hostId);
    else if (section === "edges") runEdgeSection(hostId);
    else runExactIndexedSection(hostId);
  }
}

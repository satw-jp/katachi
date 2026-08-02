// ---------------------------------------------------------------------------
// P25 sampling-density diagnosis RUNNER (diagnosis-only; `growth.test.ts`'s
// import-graph crawler asserts neither this file nor `ringSamplingDiagnosis.ts`
// is reachable from a production entry point).
//
// Run: `npm run diagnose:ring-sampling`
//   --hosts=box,sphere,waisted
//   --resolutions=64,80,96,112,128,160
//   --sections=connectivity,sweep,phase,breaks,synthetic   (default: all)
//   --gap-samples=16             samples per capsule segment in the grid-free
//                                connectivity control
//   --phase-resolution=<n>       the resolution the 8 grid phases are run at
//   --break-resolutions=64,<n>   the resolutions D2 classifies breaks at
//   --exact-resolution=64        resolution at which the EXACT hard union is
//                                run alongside the indexed one (0 = never)
//
// WHY IT IS NOT IN THE TEST SUITE
// The full 3-host × 6-resolution sweep plus an 8-phase re-measurement is tens
// of minutes and gigabytes; the suite keeps determinism, the lattice checks and
// the small synthetic fixtures. Weakening assertions to fit the matrix into the
// suite is not on the table.
//
// EVERY NUMBER PRINTED HERE IS A MEASUREMENT, NEVER A VERDICT.
// ---------------------------------------------------------------------------

import {
  DEFAULT_GROWTH_PARAMS,
  computeDerivedLateralAllowance,
  findPrinterPreset,
  fitHostToBuildVolume,
  type FabricationEnvelope,
  type GrowthParams,
  type HostFixtureId,
} from "./field.ts";
import { growNetwork, type GrowthResult } from "./growth.ts";
import { diagnosisBounds } from "./ringFusionDiagnosis.ts";
import {
  GRID_PHASES,
  fieldStepOf,
  measureSamplingRow,
  measureSyntheticRing,
  measureUnionConnectivity,
  syntheticRingPoints,
  type RingBreak,
  type SamplingSweepRow,
} from "./ringSamplingDiagnosis.ts";

// Same module-scoped declaration idiom `ringFusionDiagnosis.report.ts` uses:
// only the members this script reads.
declare const process: { argv: string[] };

function arg(name: string): string | null {
  const hit = process.argv.slice(2).find((a: string) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function numList(name: string, fallback: number[]): number[] {
  const raw = arg(name);
  if (raw === null) return fallback;
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((v) => Number.isFinite(v));
}

function n(value: number, digits = 3): string {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

/** The audited fixture: `o2Conditions(hostId, 0.25)` from `growth.test.ts`, read from the same defaults. */
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
  const params: GrowthParams = { ...DEFAULT_GROWTH_PARAMS, targetSurfaceCoverage: 0.25 };
  return { envelope, fit, params };
}

function grow(hostId: HostFixtureId): GrowthResult {
  const { envelope, fit, params } = conditions(hostId);
  return growNetwork(hostId, envelope, params, "ring-constrained", fit.scaleMmPerUnit);
}

function printRow(row: SamplingSweepRow): void {
  const c = row.cellsAcrossTube;
  console.log(
    `  res ${String(row.resolution).padStart(3)} phase ${row.phaseLabel.padEnd(11)} | ` +
      `step ${n(row.stepFieldUnits, 5)} field / ${n(row.stepMm, 4)}mm | ` +
      `tube/step ${n(c.min, 3)} / ${n(c.median, 3)} / ${n(c.max, 3)} | ` +
      `grid ${row.grid.nx}×${row.grid.ny}×${row.grid.nz} = ${row.grid.fieldSampleCount} samples`,
  );
  console.log(
    `      within-ring fragmenting units ${row.withinRingFragmentingUnitCount ?? "n/a"} ` +
      `(excess ${row.fragmentation?.withinUnitExcess ?? "n/a"}, max/unit ${row.fragmentation?.maxComponentsPerUnit ?? "n/a"}, ` +
      `severed edges ${row.fragmentation?.severedEdgeCount ?? "n/a"}, residual ${row.fragmentation?.residual ?? "n/a"}) | ` +
      `hard-union components ${row.hardUnionComponentCount}` +
      (row.exactHardUnionComponentCount === null ? "" : ` (EXACT ${row.exactHardUnionComponentCount})`) +
      ` | saved ${row.savedComponentCount} | STL round-trip ${row.stlRoundTripComponentCount}`,
  );
  console.log(
    `      component tris (top 8) [${row.componentTriangleCounts.slice(0, 8).join(", ")}]${row.componentTriangleCounts.length > 8 ? ` …+${row.componentTriangleCounts.length - 8}` : ""} | ` +
      `under 32 tris: ${row.tinyComponentCount} | non-largest share ${n(row.nonLargestTriangleShare * 100, 2)}%`,
  );
  if (row.islands) {
    const i = row.islands;
    console.log(
      `      what the non-largest components ARE: ${i.stats.length} measured | CAVITY WALLS (enclosed voids inside the solid) ${i.cavityWallCount} holding ${n(i.cavityVolumeMm3, 2)}mm³ | ` +
        `DETACHED SOLID ISLANDS ${i.solidIslandCount} holding ${n(i.solidIslandVolumeMm3, 2)}mm³ | undetermined ${i.undeterminedCount} | largest component reads ${i.largestEnclosure}`,
    );
    console.log(
      `           grid corners inside them: exactly one negative ${i.singleCornerIslands} | at most four ${i.atMostFourCornerIslands} | most in any ${i.maxCornersInANonLargestComponent} | ` +
        `bbox longest (steps) [${i.stats.slice(0, 8).map((s) => n(s.bboxLongestSteps, 2)).join(", ")}]`,
    );
  }
  console.log(
    `      tris ${row.triangleCount} (saved ${row.savedTriangleCount}) | open ${row.openEdges} non-manifold ${row.nonManifoldEdges} ` +
      `winding-inconsistent ${row.windingInconsistentEdges} degenerate ${row.degenerateTriangleCount} | ` +
      `lowest build-axis ${n(row.lowestBuildAxisMm, 4)}mm (eps ${n(row.plateBoundaryEpsilonMm, 4)}) | plate-contact vertices ${row.plateContactVertexCount}`,
  );
  console.log(
    `      bbox ${n(row.savedBboxMm.x, 2)}×${n(row.savedBboxMm.y, 2)}×${n(row.savedBboxMm.z, 2)}mm | ` +
      `material clearance ${n(row.materialClearanceFieldUnits, 5)} field units | ` +
      `mesh ${row.meshMs}ms + saved ${row.savedMeshMs}ms + components ${row.componentMs}ms + fragmentation ${row.fragmentationMs}ms + breaks ${row.breakMs}ms = ${row.totalMs}ms | ` +
      `rss ${row.rssAfterMb === null ? "not obtainable" : `${n(row.rssAfterMb, 0)}MB`}, process peak ${row.processPeakRssMb === null ? "not obtainable" : `${n(row.processPeakRssMb, 0)}MB`}`,
  );
}

function printBreaks(row: SamplingSweepRow): void {
  const b = row.breaks;
  if (!b) {
    console.log("      (breaks not measured for this row)");
    return;
  }
  console.log(
    `      [D2] units examined ${b.unitsExamined}, breaks located ${b.breaks.length} | ` +
      `at-plate-boundary ${b.bySite["at-plate-boundary"]} | near-node ${b.bySite["near-node"]} | mid-segment ${b.bySite["mid-segment"]} | ` +
      `units with no located break ${b.unitsWithNoLocatedBreak.length} | blind centreline samples ${b.blindSamples}/${b.totalSamples} | ` +
      `plate band ±${n(b.plateBandFieldUnits, 5)} field units, ${b.samplesPerStep} samples per step`,
  );
  console.log(
    `           NULL for the near-node column: ${n(b.nearNodeArcShare * 100, 1)}% of the examined rings' centreline is inside the near-node band, ` +
      `against ${b.breaks.length > 0 ? n((b.bySite["near-node"] / b.breaks.length) * 100, 1) : "n/a"}% of breaks landing there`,
  );
  if (b.breaks.length === 0) return;
  const stat = (pick: (x: RingBreak) => number) => {
    const v = b.breaks.map(pick).sort((p, q) => p - q);
    return `${n(v[0], 4)} / ${n(v[v.length >> 1], 4)} / ${n(v[v.length - 1], 4)}`;
  };
  console.log(
    `           node distance / node radius (min/median/max): ${stat((x) => x.distanceToNearestNodeFieldUnits / x.nearestNodeRadiusFieldUnits)} | ` +
      `position uncertainty ${stat((x) => x.positionUncertaintyFieldUnits)} field units`,
  );
  console.log(
    `           grid phase — corner distance ${stat((x) => x.phase.cornerDistanceSteps)} steps | ` +
      `edge distance ${stat((x) => x.phase.edgeDistanceSteps)} steps | plane distance ${stat((x) => x.phase.planeDistanceSteps)} steps`,
  );
  const perTet = [0, 1, 2, 3, 4, 5].map((t) => b.breaks.filter((x) => x.phase.tetIndex === t).length);
  console.log(`           tetra index histogram (0..5): [${perTet.join(", ")}] | on a shared tet face: ${b.breaks.filter((x) => x.phase.onTetFace).length}`);
}

// ---------------------------------------------------------------------------

const HOSTS = (arg("hosts") ?? "box,sphere,waisted").split(",").map((s) => s.trim()) as HostFixtureId[];
const RESOLUTIONS = numList("resolutions", [64, 80, 96, 112, 128, 160]);
const SECTIONS = new Set((arg("sections") ?? "connectivity,sweep,phase,breaks,synthetic").split(",").map((s) => s.trim()));
const EXACT_RESOLUTION = Number(arg("exact-resolution") ?? 64);
const BREAK_RESOLUTIONS = new Set(numList("break-resolutions", [64]));
const PHASE_RESOLUTION = Number(arg("phase-resolution") ?? 0);

console.log(`P25 sampling diagnosis — hosts [${HOSTS.join(", ")}], resolutions [${RESOLUTIONS.join(", ")}], sections [${[...SECTIONS].join(", ")}]`);
console.log("field = order-independent HARD union (ringUnionPolicies P1-hard-union), post-clip, production bounds and canonical scale");

const runs = new Map<HostFixtureId, GrowthResult>();
for (const hostId of HOSTS) {
  const t = Date.now();
  const result = grow(hostId);
  runs.set(hostId, result);
  console.log(`grown ${hostId}: ${result.units.length} units, rootCount ${result.rootCount}, ${Date.now() - t}ms`);
}

if (SECTIONS.has("synthetic")) {
  console.log(`\n${"=".repeat(78)}\n== SYNTHETIC CLOSED RING — the control\n${"=".repeat(78)}`);
  // A closed tapered-capsule chain is a connected solid by construction, so
  // every component past the first is the grid's.
  const points = syntheticRingPoints(8, 0.35, 0.0343);
  for (const res of [16, 24, 32, 40, 48, 56, 64, 80, 96]) {
    const worst = GRID_PHASES.map((p) => measureSyntheticRing(points, res, p));
    const counts = worst.map((w) => w.componentCount);
    console.log(
      `  res ${String(res).padStart(3)} | step ${n(worst[0].stepFieldUnits, 5)} | cells across tube ${n(worst[0].cellsAcrossTube, 3)} | ` +
        `components over the 8 phases [${counts.join(", ")}] | tris ${worst[0].triangleCount}`,
    );
  }
}

if (SECTIONS.has("connectivity")) {
  console.log(`\n${"=".repeat(78)}\n== GRID-FREE control — is the material connected at all?\n${"=".repeat(78)}`);
  console.log("A unit's own capsule chain is connected by construction, so the union is connected exactly when the unit-overlap graph is.");
  console.log("Overlaps are CERTIFICATES (a sampled point pair really intersects); separations are only bounded, so the answer is a bracket.");
  for (const hostId of HOSTS) {
    const result = runs.get(hostId)!;
    const t = Date.now();
    const c = measureUnionConnectivity(result, Number(arg("gap-samples") ?? 16));
    console.log(
      `  ${hostId}: ${c.unitCount} units, ${c.pairsMeasured} pairs measured | proven overlapping ${c.provenOverlappingPairs} | ` +
        `ambiguous ${c.ambiguousPairs} | proven separated ${c.provenSeparatedPairs} | max sampling error ${n(c.maxSamplingErrorFieldUnits, 5)} field units`,
    );
    console.log(
      `      TRUE component count is between ${c.componentLowerBound} (every ambiguous pair joined) and ${c.componentUpperBound} (proven overlaps only) | ` +
        `above the plate clip: ${c.componentUpperBoundAbovePlate} | component sizes (units) [${c.upperBoundComponentSizes.slice(0, 12).join(", ")}]${c.upperBoundComponentSizes.length > 12 ? ` …+${c.upperBoundComponentSizes.length - 12}` : ""}`,
    );
    console.log(
      `      parent-child edges ${c.parentChildEdgeCount} | NOT proven overlapping ${c.parentChildEdgesNotProvenOverlapping} (of which ambiguous ${c.parentChildEdgesAmbiguous}) | ${Date.now() - t}ms`,
    );
    console.log(
      `      NECK width over proven-overlapping pairs: lens ${c.neck.lensPairs}, fully contained ${c.neck.containedPairs} | ` +
        `width min/median/max ${n(c.neck.widthMinFieldUnits, 5)} / ${n(c.neck.widthMedianFieldUnits, 5)} / ${n(c.neck.widthMaxFieldUnits, 5)} field units`,
    );
    console.log(
      `      NECK on parent-child edges only: lens ${c.neck.parentChildLensPairs}, contained ${c.neck.parentChildContainedPairs} | ` +
        `width min/median/max ${n(c.neck.parentChildWidthMinFieldUnits, 5)} / ${n(c.neck.parentChildWidthMedianFieldUnits, 5)} / ${n(c.neck.parentChildWidthMaxFieldUnits, 5)} field units`,
    );
    // How many of those necks the grid at each swept resolution cannot resolve.
    // A feature needs about two cells across it before the mesher can carry it,
    // so both thresholds are printed rather than one being chosen here.
    const bounds = diagnosisBounds(result, result.params.unitRadius * 0.3);
    for (const label of ["all proven-overlapping pairs", "parent-child edges"] as const) {
      const widths = label === "parent-child edges" ? c.neck.parentChildWidthsFieldUnits : c.neck.widthsFieldUnits;
      const cells = RESOLUTIONS.map((res) => {
        const step = fieldStepOf(bounds, res);
        const under1 = widths.filter((w) => w < step).length;
        const under2 = widths.filter((w) => w < 2 * step).length;
        return `${res}: ${under1}/${under2}`;
      });
      console.log(`      necks under 1 step / under 2 steps, ${label} (${widths.length} lens pairs) — ${cells.join("  ")}`);
    }
  }
}

if (SECTIONS.has("sweep")) {
  for (const hostId of HOSTS) {
    const result = runs.get(hostId)!;
    console.log(`\n${"=".repeat(78)}\n== ${hostId} — ring-constrained, ${result.units.length} units\n${"=".repeat(78)}`);
    for (const resolution of RESOLUTIONS) {
      let row: SamplingSweepRow;
      try {
        row = measureSamplingRow(result, resolution, {
          includeExact: resolution === EXACT_RESOLUTION,
          includeFragmentation: true,
          includeBreaks: SECTIONS.has("breaks") && BREAK_RESOLUTIONS.has(resolution),
        });
      } catch (e) {
        console.log(`  res ${resolution}: STOPPED — ${(e as Error).message}`);
        break;
      }
      printRow(row);
      if (row.breaks) printBreaks(row);
    }
  }
}

if (SECTIONS.has("phase") && PHASE_RESOLUTION > 0) {
  console.log(`\n${"=".repeat(78)}\n== D1b — the 8 grid phases at resolution ${PHASE_RESOLUTION}\n${"=".repeat(78)}`);
  for (const hostId of HOSTS) {
    const result = runs.get(hostId)!;
    console.log(`\n-- ${hostId} --`);
    for (const phase of GRID_PHASES) {
      const row = measureSamplingRow(result, PHASE_RESOLUTION, { phase, includeFragmentation: true });
      printRow(row);
    }
  }
}

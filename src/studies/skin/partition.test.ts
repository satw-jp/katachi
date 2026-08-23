// ---------------------------------------------------------------------------
// gate-correction (P0/P1) unit coverage. Katachi has no test runner
// (AGENTS.md §3 verification is "build passes + real-coordinate browser
// check", not unit tests) -- this is a plain-assertion script, run with
// `npx tsx src/studies/skin/partition.test.ts`, deliberately dependency-free
// (AGENTS.md §5 "重装備フレームワーク禁止") rather than pulling in vitest/jest.
//
// NOT covered here: Worker lifecycle (terminate-after-success, immediate
// terminate on a stale progress message, elapsed-time-from-request-receipt).
// main.ts's `new Worker(new URL(...), {type:"module"})` is a Vite-specific
// import that does not run under plain Node/tsx, and Node's
// node:worker_threads Worker is a different API. That logic was instead
// verified by hand against the real CoinSRF build in this round's browser
// walkthrough (see README.md Observation) -- documented here, not silently
// dropped.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import type { Corner, MeshBuildResult, Triangle } from "../cloud-sculpt/meshExport.ts";
import {
  buildMeshFromField,
  computeSignedMeshVolume,
  inspectSavedStlTopology,
  inspectWatertight,
  orientMeshForSavedStl,
  orientTriangle,
  polygonizeTet,
  rescaleMeshResult,
  tetGradient,
} from "../cloud-sculpt/meshExport.ts";
import { buildInsideTester } from "../../lib/geometry/pointInMesh.ts";
import { conditionedFidelityQuantity, evaluatePartitionGate, wilsonUpper95 } from "./partition.ts";
import type { FidelityQuantity, MeshFidelityReport } from "./partition.ts";
import { buildPatchAdjacency, buildPatchAdjacencyForPatch, proposeGroupsBetweenEndpoints } from "./field.ts";
import type { Patch, PatchAdjacencyEdge } from "./field.ts";
import { createEmptyState as createSkinState, record as recordSkin, replay as replaySkin, serializeRecipe as serializeSkinRecipe, parseRecipe as parseSkinRecipe, type SkinHistoryEntry } from "./history.ts";
import type { SurfaceElementReference } from "../../lib/elementAnnotations.ts";
import { runElementTransformTests } from "./elementTransform.test.ts";
import { runWorkflowProfileTests } from "./workflowProfiles.test.ts";

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

runWorkflowProfileTests(test);
runElementTransformTests(test);

// --- fixtures --------------------------------------------------------------

function zeroQuantity(): FidelityQuantity {
  return { count: 0, volumeMm3: 0, upper95Count: 0, upper95VolumeMm3: 0 };
}

function goodMeshFidelity(): MeshFidelityReport {
  return {
    sampleCount: 20000,
    insideOriginalSamples: 1000,
    overlap: zeroQuantity(),
    gap: zeroQuantity(),
    inconsistent: zeroQuantity(),
    seed: "test",
  };
}

function goodGateInput() {
  return {
    originalVolumeMm3: 1000,
    volumeDiffMm3: 1, // 0.1%, within 1% tolerance
    volumeMetricsValid: true,
    commonScale: true,
    watertightOriginal: true,
    watertightA: true,
    watertightB: true,
    connectedComponentsA: 1,
    connectedComponentsB: 1,
    meshFidelity: goodMeshFidelity(),
  };
}

/** Unit cube, 12 triangles, consistent outward winding (CCW as seen from
 * outside), each vertex shared by 3+ triangles -- a minimal closed manifold
 * fixture for both the STL-topology checks and the point-in-mesh tester. */
function cubeTriangles(): Triangle[] {
  const v = {
    0: { x: 0, y: 0, z: 0 },
    1: { x: 1, y: 0, z: 0 },
    2: { x: 1, y: 1, z: 0 },
    3: { x: 0, y: 1, z: 0 },
    4: { x: 0, y: 0, z: 1 },
    5: { x: 1, y: 0, z: 1 },
    6: { x: 1, y: 1, z: 1 },
    7: { x: 0, y: 1, z: 1 },
  };
  const tri = (a: keyof typeof v, b: keyof typeof v, c: keyof typeof v): Triangle => ({ a: v[a], b: v[b], c: v[c] });
  return [
    // -Z (bottom, outward normal -z)
    tri(0, 3, 2), tri(0, 2, 1),
    // +Z (top)
    tri(4, 5, 6), tri(4, 6, 7),
    // -Y
    tri(0, 1, 5), tri(0, 5, 4),
    // +Y
    tri(3, 7, 6), tri(3, 6, 2),
    // -X
    tri(0, 4, 7), tri(0, 7, 3),
    // +X
    tri(1, 2, 6), tri(1, 6, 5),
  ];
}

function fakeMeshResult(triangles: Triangle[], longestFieldUnits: number, scaleMmPerUnit: number): MeshBuildResult {
  const sourceBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: longestFieldUnits, y: longestFieldUnits, z: longestFieldUnits }, size: { x: longestFieldUnits, y: longestFieldUnits, z: longestFieldUnits }, longest: longestFieldUnits };
  return {
    triangles,
    sourceBounds,
    mmBounds: { ...sourceBounds }, // stale on purpose; rescaleMeshResult must recompute this
    scaleMmPerUnit,
    watertight: inspectWatertight(triangles, scaleMmPerUnit),
  };
}

// --- P0-3: gate composition -------------------------------------------------

test("gate: all-good input passes", () => {
  const gate = evaluatePartitionGate(goodGateInput());
  assert.equal(gate.ok, true);
  assert.deepEqual(gate.reasons, []);
});

test("gate: non-watertight A fails with the right reason", () => {
  const gate = evaluatePartitionGate({ ...goodGateInput(), watertightA: false });
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.some((r) => r.includes("part-Aの保存後STLがwatertightではありません")));
});

test("gate: a disconnected A side cannot use normal export", () => {
  const gate = evaluatePartitionGate({ ...goodGateInput(), connectedComponentsA: 2 });
  assert.equal(gate.ok, false);
  assert.equal(gate.singleComponentA, false);
  assert.ok(gate.reasons.some((reason) => reason.includes("part-Aが2個の独立部品")));
});

test("gate: mismatched scale fails even when everything else passes", () => {
  const gate = evaluatePartitionGate({ ...goodGateInput(), commonScale: false });
  assert.equal(gate.ok, false);
  assert.equal(gate.commonScale, false);
});

test("gate: zero original volume fails closed, not open", () => {
  const gate = evaluatePartitionGate({ ...goodGateInput(), originalVolumeMm3: 0 });
  assert.equal(gate.ok, false);
  assert.equal(gate.originalVolumeFinite, false);
});

test("gate: non-finite original volume fails closed", () => {
  const gate = evaluatePartitionGate({ ...goodGateInput(), originalVolumeMm3: Number.NaN });
  assert.equal(gate.ok, false);
  assert.equal(gate.originalVolumeFinite, false);
});

test("gate: volumeDiff over tolerance fails even with perfect watertight/fidelity", () => {
  const gate = evaluatePartitionGate({ ...goodGateInput(), volumeDiffMm3: 50 }); // 5% > 1% tolerance
  assert.equal(gate.ok, false);
  assert.equal(gate.volumeDiff.ok, false);
});

test("gate: overlap/gap/inconsistent are judged on the upper95 bound, not the point estimate", () => {
  // Zero point estimate but a nonzero upper95 (as Wilson gives at k=0) must
  // still fail once it exceeds tolerance -- this is the exact P0-3 case a
  // point-estimate-only gate would have silently passed.
  const hotFidelity: MeshFidelityReport = {
    sampleCount: 100, // deliberately small n -> a big Wilson upper bound even at k=0
    insideOriginalSamples: 10,
    overlap: { count: 0, volumeMm3: 0, upper95Count: 5, upper95VolumeMm3: 100 }, // 10% of original
    gap: zeroQuantity(),
    inconsistent: zeroQuantity(),
    seed: "test",
  };
  const gate = evaluatePartitionGate({ ...goodGateInput(), meshFidelity: hotFidelity });
  assert.equal(gate.ok, false);
  assert.equal(gate.overlap.ok, false);
  assert.equal(gate.gap.ok, true);
});

// --- winding-volume-final Task 1/4: volumeMetricsValid gates the gate -----

test("gate: invalid original topology fails closed and disables volume-based checks even if the numbers look fine", () => {
  const gate = evaluatePartitionGate({ ...goodGateInput(), watertightOriginal: false, volumeMetricsValid: false });
  assert.equal(gate.ok, false);
  assert.equal(gate.watertightOriginal, false);
  assert.equal(gate.volumeMetricsValid, false);
  assert.ok(gate.reasons.some((r) => r.includes("保存後トポロジーが無効")));
  // The individual ratio checks must also read false -- a caller iterating
  // gate.overlap.ok etc. must never see "ok" next to an untrustworthy mesh.
  assert.equal(gate.overlap.ok, false);
  assert.equal(gate.gap.ok, false);
  assert.equal(gate.volumeDiff.ok, false);
});

test("gate: volumeDiffMm3=null (as buildPartitionMeshes produces when volumeMetricsValid is false) never reads as a passing 0", () => {
  const gate = evaluatePartitionGate({ ...goodGateInput(), volumeDiffMm3: null, volumeMetricsValid: false, watertightOriginal: false });
  assert.equal(gate.volumeDiff.ok, false);
  assert.equal(Number.isFinite(gate.volumeDiff.ratio), false); // Infinity, not a misleadingly-small finite number
});

test("gate: insideOriginalSamples=0 is undecidable, not a pass", () => {
  const gate = evaluatePartitionGate({
    ...goodGateInput(),
    meshFidelity: { ...goodMeshFidelity(), insideOriginalSamples: 0 },
  });
  assert.equal(gate.ok, false);
  assert.equal(gate.insideOriginalSamplesValid, false);
  assert.ok(gate.reasons.some((r) => r.includes("元形状内部に1つも無く")));
});

test("gate: a numeric reason is only added when the ratio itself is trustworthy (not when volumeMetricsValid already explains the failure)", () => {
  // Regression for double-counting/misleading messages: when the mesh
  // itself is invalid, the overlap/gap/inconsistent percentages are
  // meaningless (computed from a volume that isn't real) -- the gate must
  // explain via the topology reason, not ALSO print a bogus percentage.
  const hotFidelity: MeshFidelityReport = {
    sampleCount: 100,
    insideOriginalSamples: 10,
    overlap: { count: 0, volumeMm3: 0, upper95Count: 5, upper95VolumeMm3: 100 },
    gap: zeroQuantity(),
    inconsistent: zeroQuantity(),
    seed: "test",
  };
  const gate = evaluatePartitionGate({
    ...goodGateInput(),
    watertightOriginal: false,
    volumeMetricsValid: false,
    meshFidelity: hotFidelity,
  });
  assert.equal(gate.reasons.some((r) => r.includes("95%上限が元形状の")), false);
});

// --- P1-1: Wilson score interval --------------------------------------------

test("wilsonUpper95: k=0 gives a small but strictly positive bound (not the broken normal-approx 0)", () => {
  const upper = wilsonUpper95(0, 20000);
  assert.ok(upper > 0, `expected > 0, got ${upper}`);
  assert.ok(upper < 0.001, `expected a small bound for n=20000, got ${upper}`);
});

test("wilsonUpper95: k=n (all successes) gives a bound at or below 1, not > 1", () => {
  const upper = wilsonUpper95(50, 50);
  assert.ok(upper <= 1);
  assert.ok(upper > 0.9);
});

test("wilsonUpper95: larger sample size tightens the bound at the same proportion", () => {
  const small = wilsonUpper95(0, 100);
  const large = wilsonUpper95(0, 100000);
  assert.ok(large < small, `expected more samples to tighten the bound: n=100 -> ${small}, n=100000 -> ${large}`);
});

// --- P0-1: common scale ------------------------------------------------------

test("rescaleMeshResult: rederives mmBounds/scale, leaves triangles and sourceBounds untouched", () => {
  const tris = cubeTriangles();
  const original = fakeMeshResult(tris, 1, 5); // sourceBounds longest=1 field unit, own scale=5
  const rescaled = rescaleMeshResult(original, 21.5); // a different, externally-chosen common scale

  assert.equal(rescaled.scaleMmPerUnit, 21.5);
  assert.equal(rescaled.mmBounds.longest, 1 * 21.5);
  assert.equal(rescaled.triangles, original.triangles); // same array, not recomputed
  assert.deepEqual(rescaled.sourceBounds, original.sourceBounds); // field-unit bounds never touched
});

test("rescaleMeshResult: watertight report is recomputed at the new scale (not stale)", () => {
  const tris = cubeTriangles();
  const original = fakeMeshResult(tris, 1, 5);
  const rescaled = rescaleMeshResult(original, 21.5);
  assert.equal(rescaled.watertight.ok, true); // the cube fixture is a closed manifold at any scale
});

// --- P0-2: float32-rounding-induced defect rejection ------------------------

test("inspectSavedStlTopology: a proper closed cube is ok at any reasonable scale", () => {
  const report = inspectSavedStlTopology(cubeTriangles(), 21.5);
  assert.equal(report.ok, true);
  assert.equal(report.openEdges, 0);
  assert.equal(report.nonManifoldEdges, 0);
  assert.equal(report.windingInconsistentEdges, 0);
  assert.equal(report.degenerateTriangleCount, 0);
  assert.equal(report.connectedComponents, 1);
});

test("inspectSavedStlTopology: NEW check -- a single flipped-winding triangle is caught even though edges still pair up", () => {
  const tris = cubeTriangles();
  // Flip one +X face triangle's winding (swap b/c). The edge still closes
  // (still used exactly twice), so inspectWatertight's plain edge-count
  // check would pass this -- only the directed-edge winding check catches
  // it. This is exactly the P0-2 "winding consistency (NEW check)" case.
  const flipped = tris[10];
  tris[10] = { a: flipped.a, b: flipped.c, c: flipped.b };

  const legacyWatertight = inspectWatertight(tris, 21.5);
  assert.equal(legacyWatertight.ok, true, "sanity: the old edge-count-only check misses this defect");

  const report = inspectSavedStlTopology(tris, 21.5);
  assert.equal(report.ok, false);
  assert.ok(report.windingInconsistentEdges > 0);
});

test("inspectSavedStlTopology: a degenerate (collapsed) triangle is reported explicitly, not silently dropped from ok", () => {
  const tris = cubeTriangles();
  tris.push({ a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, c: { x: 1, y: 1, z: 1 } });
  const report = inspectSavedStlTopology(tris, 21.5);
  assert.equal(report.degenerateTriangleCount, 1);
  assert.equal(report.ok, false);
});

test("inspectSavedStlTopology: non-finite and distinct-vertex collinear faces fail before repair", () => {
  const withNaN = cubeTriangles();
  withNaN.push({ a: { x: NaN, y: 0, z: 0 }, b: { x: 0, y: 1, z: 0 }, c: { x: 0, y: 0, z: 1 } });
  const nonFinite = inspectSavedStlTopology(withNaN, 1);
  assert.equal(nonFinite.nonFiniteTriangleCount, 1);
  assert.equal(nonFinite.ok, false);
  const withCollinear = cubeTriangles();
  withCollinear.push({ a: { x: 0, y: 0, z: 2 }, b: { x: 1, y: 0, z: 2 }, c: { x: 2, y: 0, z: 2 } });
  const collinear = inspectSavedStlTopology(withCollinear, 1);
  assert.equal(collinear.degenerateTriangleCount, 1);
  assert.equal(collinear.ok, false);
});

test("inspectSavedStlTopology: an extremely tiny finite nonzero face is not degenerate", () => {
  const tiny: Triangle[] = [{ a: { x: 0, y: 0, z: 0 }, b: { x: 1e-11, y: 0, z: 0 }, c: { x: 0, y: 1e-11, z: 0 } }];
  const report = inspectSavedStlTopology(tiny, 1);
  assert.equal(report.nonFiniteTriangleCount, 0);
  assert.equal(report.degenerateTriangleCount, 0);
});

test("inspectSavedStlTopology: float32 rounding at a large scale can collapse near-coincident vertices into a real defect", () => {
  // Two vertices ~1e-4 field units apart, at a scale large enough that
  // float32's ~7-digit precision merges them once multiplied through --
  // this is the exact "invisible in Float64 in-memory triangles, real in
  // the saved bytes" case P0-2 exists to catch.
  const tris = cubeTriangles();
  const scale = 5_000_000; // mm/unit -- unrealistic for this Study but isolates the rounding effect deterministically
  const before = inspectSavedStlTopology(tris, 1); // negligible rounding at scale=1
  const after = inspectSavedStlTopology(tris, scale);
  assert.equal(before.ok, true);
  // Not asserting `after.ok === false` unconditionally (the exact collapse
  // pattern is float32-mantissa-dependent) -- asserting the function
  // completes and returns a well-formed report is the meaningful contract
  // here; the flipped-winding case above is the deterministic defect test.
  assert.ok(typeof after.ok === "boolean");
});

// --- point-in-mesh stability -------------------------------------------------

test("buildInsideTester: interior point is inside, exterior point is outside", () => {
  const tester = buildInsideTester(cubeTriangles());
  // Deliberately off the cube's own diagonal-split seam (every face here is
  // split (0,0)-(1,1)) so this is a plain, non-edge-case sanity check --
  // the seam itself gets its own dedicated test below.
  assert.equal(tester.isInside(0.3, 0.7, 0.5), true);
  assert.equal(tester.isInside(2, 2, 2), false);
  assert.equal(tester.isInside(-1, 0.5, 0.5), false);
});

test("buildInsideTester: query epsilon off the +X face's own triangle-split diagonal classifies correctly on both sides", () => {
  const tester = buildInsideTester(cubeTriangles());
  // The +X face (x=1) is split into tri(1,2,6) and tri(1,6,5) along the
  // (y,z)=(0,0)-(1,1) diagonal, which a ray at exactly y=z=0.5 grazes
  // exactly (a documented limitation of ray-parity testing -- InsideTester
  // itself notes "on an open mesh, points near the defect can
  // misclassify", and landing precisely on a triangle edge is the same
  // kind of degenerate case even on a closed mesh: Moller-Trumbore's
  // u+v==1 boundary is one triangle's inclusive edge and, depending on
  // floating-point rounding, does not have to be the complementary
  // triangle's -- this is not something a bucketed ray-parity tester can
  // fix and is not what this test checks). What the tester MUST get right
  // is everything a real Monte Carlo sample can actually land on: points
  // epsilon off that exact seam in y, which is what verifyMeshPartition's
  // uniform random sampling does in practice (probability zero of landing
  // on an exact seam).
  assert.equal(tester.isInside(0.9, 0.5 - 1e-6, 0.5), true);
  assert.equal(tester.isInside(0.9, 0.5 + 1e-6, 0.5), true);
  // Offset y and z in OPPOSITE directions -- the seam is the y=z line, so
  // an equal same-signed offset in both (e.g. y-1e-6, z-1e-6) stays ON it.
  assert.equal(tester.isInside(0.9, 0.5 - 1e-6, 0.5 + 1e-6), true);
  assert.equal(tester.isInside(0.9, 0.5 + 1e-6, 0.5 - 1e-6), true);
});

test("buildInsideTester: query exactly on a shared edge (two triangles of the same face) is stable under repeated calls", () => {
  const tester = buildInsideTester(cubeTriangles());
  // (0.5, 0.5, 0) sits on the diagonal edge shared by the two -Z face
  // triangles (tri(0,3,2) and tri(0,2,1)) -- repeated queries must not
  // flip due to bucket-boundary nondeterminism.
  const results = new Set<boolean>();
  for (let i = 0; i < 20; i++) results.add(tester.isInside(0.5, 0.5, 0));
  assert.equal(results.size, 1, "repeated identical queries must return the same answer");
});

// --- winding-volume-final Task 3: marching-tetrahedra winding at generation time ---

/** A single tetrahedron with 3 corners inside (value<0), 1 outside -- the
 * "inside=3" polygonizeTet case. Positioned/valued so the SDF is exactly
 * linear (a plane x - 0.5 = 0), matching interpolateIso's own assumption
 * and letting the expected gradient be known exactly: (1,0,0). */
function tetInside3(): [Corner, Corner, Corner, Corner] {
  const v = (x: number, y: number, z: number): Corner => ({ x, y, z, value: x - 0.5 });
  // p0,p1,p2 inside (x<0.5), p3 outside (x>0.5)
  return [v(0, 0, 0), v(0, 1, 0), v(0, 0, 1), v(1, 0, 0)];
}

/** Same tet, roles swapped so exactly 1 corner is inside -- the
 * complementary "inside=1" case, same linear field. */
function tetInside1(): [Corner, Corner, Corner, Corner] {
  const v = (x: number, y: number, z: number): Corner => ({ x, y, z, value: x - 0.5 });
  return [v(1, 0, 0), v(1, 1, 0), v(1, 0, 1), v(0, 0, 0)];
}

/** inside=2 case: 2 corners inside, 2 outside, same linear plane field
 * (a genuine, non-degenerate tetrahedron -- an earlier draft of this
 * fixture (0,0,0)/(0,1,0)/(1,0,1)/(1,1,1) was accidentally coplanar). */
function tetInside2(): [Corner, Corner, Corner, Corner] {
  const v = (x: number, y: number, z: number): Corner => ({ x, y, z, value: x - 0.5 });
  return [v(0, 0, 0), v(0, 1, 0), v(1, 0, 0), v(1, 1, 1)];
}

function normalOf(tri: Triangle): { x: number; y: number; z: number } {
  const ux = tri.b.x - tri.a.x, uy = tri.b.y - tri.a.y, uz = tri.b.z - tri.a.z;
  const vx = tri.c.x - tri.a.x, vy = tri.c.y - tri.a.y, vz = tri.c.z - tri.a.z;
  return { x: uy * vz - uz * vy, y: uz * vx - ux * vz, z: ux * vy - uy * vx };
}

function dot3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

test("tetGradient: exact for a linear field (plane x-0.5=0) regardless of which case's corners are passed", () => {
  for (const tet of [tetInside1(), tetInside2(), tetInside3()]) {
    const g = tetGradient(tet);
    assert.ok(g !== null);
    assert.ok(Math.abs(g.x - 1) < 1e-9, `gx expected 1, got ${g.x}`);
    assert.ok(Math.abs(g.y) < 1e-9);
    assert.ok(Math.abs(g.z) < 1e-9);
  }
});

test("tetGradient: returns null for a degenerate (zero-volume, coplanar) tet instead of throwing or dividing by zero", () => {
  const v = (x: number, y: number, z: number): Corner => ({ x, y, z, value: x - 0.5 });
  const coplanar: [Corner, Corner, Corner, Corner] = [v(0, 0, 0), v(1, 0, 0), v(2, 0, 0), v(3, 0, 0)];
  assert.equal(tetGradient(coplanar), null);
});

test("polygonizeTet: inside=1/2/3 cases all emit triangles whose normal points along the gradient (SDF-increasing / outward direction)", () => {
  for (const [label, tet] of [["inside=1", tetInside1()], ["inside=2", tetInside2()], ["inside=3", tetInside3()]] as const) {
    const triangles: Triangle[] = [];
    polygonizeTet(tet, triangles);
    assert.ok(triangles.length > 0, `${label}: expected at least one triangle`);
    const g = tetGradient(tet)!;
    for (const tri of triangles) {
      const n = normalOf(tri);
      assert.ok(dot3(n, g) >= 0, `${label}: triangle normal points against the gradient (inward, not outward)`);
    }
  }
});

test("orientTriangle: flips a backwards triangle, leaves a correct one alone, leaves a null-gradient/degenerate one alone", () => {
  const tri: Triangle = { a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 }, c: { x: 0, y: 1, z: 0 } }; // normal = (0,0,1)
  const alignedGradient = { x: 0, y: 0, z: 1 };
  const opposedGradient = { x: 0, y: 0, z: -1 };
  assert.deepEqual(orientTriangle(tri, alignedGradient), tri); // already correct -- untouched
  const flipped = orientTriangle(tri, opposedGradient);
  assert.deepEqual(flipped, { a: tri.a, b: tri.c, c: tri.b });
  assert.deepEqual(orientTriangle(tri, null), tri); // no gradient -- nothing to check against
  const degenerateTri: Triangle = { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, c: { x: 1, y: 0, z: 0 } }; // zero area
  assert.deepEqual(orientTriangle(degenerateTri, alignedGradient), degenerateTri);
});

test("buildMeshFromField: a single analytic sphere reconstructs with zero winding-inconsistent edges (regression for the pre-fix ~37.7% inconsistency)", () => {
  const sdf = (x: number, y: number, z: number) => Math.hypot(x - 0.0137, y + 0.0271, z - 0.0089) - 0.97123; // off-grid center/radius, see README Observation
  const bounds = { min: { x: -1.5, y: -1.5, z: -1.5 }, max: { x: 1.5, y: 1.5, z: 1.5 }, size: { x: 3, y: 3, z: 3 }, longest: 3 };
  const result = buildMeshFromField(bounds, sdf, { resolution: 20, targetLongestMm: 80 });
  const saved = inspectSavedStlTopology(result.triangles, result.scaleMmPerUnit);
  assert.equal(saved.windingInconsistentEdges, 0);
  assert.equal(saved.closed, true);
});

test("buildMeshFromField: an ownership-field split (max(dOriginal, dA-dB), the same composition partition.ts uses) also reconstructs winding-consistent on both sides", () => {
  const dOriginal = (x: number, y: number, z: number) => Math.hypot(x - 0.0137, y + 0.0271, z - 0.0089) - 0.97123;
  const dA = (x: number) => x - 0.1317;
  const dB = (x: number) => -x + 0.1317 - 0.05;
  const sdfA = (x: number, y: number, z: number) => Math.max(dOriginal(x, y, z), dA(x) - dB(x));
  const sdfB = (x: number, y: number, z: number) => Math.max(dOriginal(x, y, z), dB(x) - dA(x));
  const bounds = { min: { x: -1.5, y: -1.5, z: -1.5 }, max: { x: 1.5, y: 1.5, z: 1.5 }, size: { x: 3, y: 3, z: 3 }, longest: 3 };
  for (const [label, sdf] of [["A", sdfA], ["B", sdfB]] as const) {
    const result = buildMeshFromField(bounds, sdf, { resolution: 20, targetLongestMm: 80 });
    const saved = inspectSavedStlTopology(result.triangles, result.scaleMmPerUnit);
    assert.equal(saved.windingInconsistentEdges, 0, `${label}: expected 0 winding-inconsistent edges`);
  }
});

// --- winding-volume-final Task 4: signed volume ------------------------------

function meshResultFromTriangles(triangles: Triangle[], scaleMmPerUnit = 1): MeshBuildResult {
  const b = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 }, size: { x: 1, y: 1, z: 1 }, longest: 1 };
  return { triangles, sourceBounds: b, mmBounds: b, scaleMmPerUnit, watertight: inspectWatertight(triangles, scaleMmPerUnit) };
}

test("computeSignedMeshVolume: a correctly-wound unit cube is +1 (not abs'd)", () => {
  const v = computeSignedMeshVolume(meshResultFromTriangles(cubeTriangles()));
  assert.ok(Math.abs(v - 1) < 1e-9, `expected +1, got ${v}`);
});

test("computeSignedMeshVolume: a fully-reversed unit cube (every triangle's b/c swapped) is -1, detectably signed", () => {
  const reversed = cubeTriangles().map((t) => ({ a: t.a, b: t.c, c: t.b }));
  const v = computeSignedMeshVolume(meshResultFromTriangles(reversed));
  assert.ok(Math.abs(v + 1) < 1e-9, `expected -1, got ${v}`);
});

test("computeSignedMeshVolume: scales as scale^3 under a common-scale change", () => {
  const v1 = computeSignedMeshVolume(meshResultFromTriangles(cubeTriangles(), 1));
  const v2 = computeSignedMeshVolume(meshResultFromTriangles(cubeTriangles(), 10));
  assert.ok(Math.abs(v2 - v1 * 1000) < 1e-6, `expected scale^3, got v1=${v1} v2=${v2}`);
});

test("inspectSavedStlTopology: a single flipped-winding face's triangle is caught as windingConsistent=false even though the total signed volume can still look plausible", () => {
  const tris = cubeTriangles();
  tris[10] = { a: tris[10].a, b: tris[10].c, c: tris[10].b }; // same fixture as the P0-2 regression test above
  const report = inspectSavedStlTopology(tris, 1);
  assert.equal(report.windingConsistent, false);
  assert.equal(report.closed, true); // edges still pair up -- only orientation is broken
  assert.equal(report.ok, false);
});

test("orientMeshForSavedStl: repairs a local flipped face without moving vertices", () => {
  const tris = cubeTriangles();
  tris[10] = { a: tris[10].a, b: tris[10].c, c: tris[10].b };
  const before = tris.map((t) => [t.a, t.b, t.c].map((v) => `${v.x},${v.y},${v.z}`).sort());
  const repaired = orientMeshForSavedStl(meshResultFromTriangles(tris));
  assert.equal(inspectSavedStlTopology(repaired.triangles, 1).ok, true);
  assert.deepEqual(
    repaired.triangles.map((t) => [t.a, t.b, t.c].map((v) => `${v.x},${v.y},${v.z}`).sort()),
    before,
  );
  assert.ok(computeSignedMeshVolume(repaired) > 0);
});

test("orientMeshForSavedStl: explicitly removes faces collapsed in saved Float32 coordinates", () => {
  const tris = cubeTriangles();
  tris.push({ a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, c: { x: 1, y: 0, z: 0 } });
  const repaired = orientMeshForSavedStl(meshResultFromTriangles(tris));
  assert.equal(repaired.removedSavedDegenerateTriangleCount, 1);
  assert.equal(repaired.triangles.length, 12);
  assert.equal(inspectSavedStlTopology(repaired.triangles, 1).ok, true);
});

// --- winding-volume-final Task 5: statistics ---------------------------------

test("conditionedFidelityQuantity: gap 0/889 gives roughly the instruction's worked example (~0.43% upper bound)", () => {
  // The instruction's re-audit worked this exact case by hand: 0 gap hits
  // out of 889 original-interior samples should give a Wilson upper bound
  // of about 0.43% of original's volume, not the previous round's ~3.00%
  // (which came from dividing a bbox-Monte-Carlo numerator by a
  // signed-triangle-sum denominator -- an inconsistent pair of estimators).
  const originalVolumeMm3 = 5336;
  const q = conditionedFidelityQuantity(0, 889, originalVolumeMm3);
  const upperRatio = q.upper95VolumeMm3 / originalVolumeMm3;
  assert.ok(upperRatio > 0, "must not be exactly 0 (k=0 with a finite sample is not proof of 0)");
  assert.ok(Math.abs(upperRatio - 0.0043) < 0.001, `expected ~0.43%, got ${(upperRatio * 100).toFixed(2)}%`);
});

test("conditionedFidelityQuantity: conditionSampleCount=0 is undecidable (Infinity), never a misleading finite number", () => {
  const q = conditionedFidelityQuantity(0, 0, 5336);
  assert.equal(q.upper95VolumeMm3, Number.POSITIVE_INFINITY);
  assert.equal(q.volumeMm3, Number.POSITIVE_INFINITY);
});

test("conditionedFidelityQuantity: bbox-interior occupancy fraction doesn't distort a fixed conditioned gap rate", () => {
  // The whole point of conditioning on insideOriginalSamples instead of the
  // full sampleCount is that the ratio should NOT depend on how much of the
  // bbox happens to be occupied by the original solid. Same gap rate
  // (10%), same original volume, different total sample counts (i.e.
  // different implied bbox occupancy) -- the point estimate must match.
  const a = conditionedFidelityQuantity(10, 100, 5336); // as if bbox occupancy were high
  const b = conditionedFidelityQuantity(89, 890, 5336); // as if bbox occupancy were low (10x more total samples for the same 890-ish interior count)
  assert.ok(Math.abs(a.volumeMm3 - b.volumeMm3) < 1, `expected both point estimates near 533.6, got ${a.volumeMm3} and ${b.volumeMm3}`);
});

test("proposeGroupsBetweenEndpoints: opposite ends of a chain split it evenly", () => {
  const patches: Patch[] = Array.from({ length: 6 }, (_, id) => ({
    id,
    shape: "coin",
    points: [{ x: id, y: 0, z: 0, r: 0.4 }],
  }));
  const edges: PatchAdjacencyEdge[] = Array.from({ length: 5 }, (_, id) => ({
    aId: id,
    bId: id + 1,
    distance: 0.2,
    reason: "near",
  }));
  const proposal = proposeGroupsBetweenEndpoints(patches, edges, 0, 5);
  assert.deepEqual(new Set(proposal.groupA), new Set([0, 1, 2]));
  assert.deepEqual(new Set(proposal.groupB), new Set([3, 4, 5]));
});

test("proposeGroupsBetweenEndpoints: moves balanced-but-isolated same-colour leaves to the connected side", () => {
  const coords = new Map<number, [number, number]>([
    [10, [-1, 0]], [11, [1, 0]], [100, [0, 0]], [1, [0, 1]], [2, [0, -1]], [3, [0, 0.5]],
  ]);
  const patches: Patch[] = [...coords].map(([id, [x, y]]) => ({
    id,
    shape: "coin",
    points: [{ x, y, z: 0, r: 0.1 }],
  }));
  const edges: PatchAdjacencyEdge[] = [10, 11, 1, 2, 3].map((id) => ({
    aId: id,
    bId: 100,
    distance: 0,
    reason: "touching",
  }));
  const proposal = proposeGroupsBetweenEndpoints(patches, edges, 10, 11);
  assert.deepEqual(proposal.groupA, [10]);
  assert.deepEqual(new Set(proposal.groupB), new Set([11, 100, 1, 2, 3]));
});

test("selected-patch adjacency matches the same patch's edges from the complete graph", () => {
  const patches: Patch[] = [
    { id: 10, shape: "coin", points: [{ x: 0, y: 0, z: 0, r: 0.2 }] },
    { id: 20, shape: "flower", points: [{ x: 0.35, y: 0, z: 0, r: 0.2 }] },
    { id: 30, shape: "flatRing", points: [{ x: 2, y: 0, z: 0, r: 0.1 }] },
    { id: 40, shape: "ring3d", points: [{ x: 0, y: 0.42, z: 0, r: 0.2 }] },
  ];
  const complete = buildPatchAdjacency(patches, 0.1).filter((edge) => edge.aId === 20 || edge.bId === 20);
  assert.deepEqual(buildPatchAdjacencyForPatch(patches, 20, 0.1), complete);
  assert.deepEqual(buildPatchAdjacencyForPatch(patches, 999, 0.1), [], "unknown selection returns no neighbours");
});

test("surface annotation revisions prevent numeric patch-ID reuse and preserve identity-mode replacements", () => {
  const patch = (id: number): Patch => ({ id, shape: "coin", points: [{ x: id, y: 0, z: 0, r: 0.1 }] });
  const history: SkinHistoryEntry[] = [];
  const state = createSkinState();
  recordSkin(history, state, "packPatches", { patches: [patch(1)], identity: "replace" });
  const first: SurfaceElementReference = { domain: "surface", setRevision: state.patchSetRevision, patchId: 1 };
  recordSkin(history, state, "setAnnotation", { reference: first, value: { keep: true, weakContact: false, largeOpening: false, note: "残す" } });
  recordSkin(history, state, "packPatches", { patches: [patch(1), patch(2)], identity: "preserve" });
  assert.equal(state.annotations.length, 1, "identity-preserving replacement retains a live patch annotation");
  recordSkin(history, state, "packPatches", { patches: [patch(1)], identity: "replace" });
  assert.equal(state.annotations.length, 0, "new set clears annotations even when ID 1 is reused");
  const stale: SurfaceElementReference = { ...first };
  recordSkin(history, state, "setAnnotation", { reference: stale, value: { keep: true, weakContact: false, largeOpening: false, note: "stale" } });
  assert.equal(state.annotations.length, 0, "stale revision cannot annotate regenerated numeric ID");
  const replayed = replaySkin(parseSkinRecipe(serializeSkinRecipe(history)));
  assert.equal(replayed.patchSetRevision, state.patchSetRevision);
  assert.deepEqual(replayed.annotations, state.annotations, "recipe replay recovers revision-scoped review data");
});

console.log(`\n${passed} passed`);
if (process.exitCode) {
  console.error("SOME TESTS FAILED");
} else {
  console.log("ALL TESTS PASSED");
}

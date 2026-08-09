// ---------------------------------------------------------------------------
// Phase C1 coverage for src/studies/interior-growth/solidTopology.ts — the
// shell containment tree and, above all, the LOCAL field probe that replaced
// the deep containment representative + mirror as the field-side check.
//
// Plain-assertion script run via `npx tsx`, same convention as
// `growth.test.ts` / `ringUnionPolicies.test.ts` / `skin/partition.test.ts`
// (AGENTS.md §5「重装備フレームワーク禁止」— no vitest/jest).
//
// Run: `npm run test:interior-growth` (runs growth.test.ts then this file).
//
// WHAT IS PINNED, AND WHAT IS NOT
// ------------------------------
// Fixtures 1-18 are hand-made: axis-aligned boxes whose shells, nesting depth,
// material thickness and field are written down rather than measured, so the
// right answer for each is known BY CONSTRUCTION and a passing number cannot be
// a coincidence.
//
// The three real ring-constrained hosts at resolution 64 are pinned to what
// this round MEASURED, not to any earlier expectation. Where the field probe
// could not confirm a shell, the test says "inconclusive" and pins that —
// several test names below are deliberately weaker than "correct", because the
// evidence is weaker than "correct".
//
// No tolerance and no band was widened to make a fixture land on an expected
// class. The band statistics are asserted in the direction they are measured
// (p50 <= p90 <= p99 <= max) and, where a fixture makes the value exact by
// construction, asserted exactly.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";

import {
  LOCAL_PROBE_GRID_STEP_MULTIPLES,
  classifySolidTopology,
  solidTopologySummary,
  type ShellStat,
  type SolidTopologyReport,
} from "./solidTopology.ts";
import type { MeshVertex, Triangle } from "../cloud-sculpt/meshExport.ts";
import {
  DEFAULT_GROWTH_PARAMS,
  buildPlateOffset,
  computeDerivedLateralAllowance,
  findPrinterPreset,
  fitHostToBuildVolume,
  vNorm,
  type FabricationEnvelope,
  type HostFixtureId,
} from "./field.ts";
import { createUnitsFieldSampler, growNetwork, type GrowthResult } from "./growth.ts";
import { aboveBuildPlateSdf, buildCandidateMesh, computeUnitBounds } from "./meshExport.ts";

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

// ===========================================================================
// Hand-made fixture kit
// ===========================================================================

type Field = (x: number, y: number, z: number) => number;

const v = (x: number, y: number, z: number): MeshVertex => ({ x, y, z });
const ORIGIN = v(0, 0, 0);

function quad(a: MeshVertex, b: MeshVertex, c: MeshVertex, d: MeshVertex): Triangle[] {
  return [
    { a, b, c },
    { a, b: c, c: d },
  ];
}

/**
 * An axis-aligned box as 12 triangles, every face wound CCW seen from OUTSIDE.
 * Adjacent faces share exact vertex coordinates, so the 12 triangles form one
 * edge-connected, closed, winding-consistent shell — which the tests assert
 * rather than assume.
 */
function boxTriangles(center: MeshVertex, half: MeshVertex): Triangle[] {
  const p = (sx: number, sy: number, sz: number): MeshVertex =>
    v(center.x + sx * half.x, center.y + sy * half.y, center.z + sz * half.z);
  return [
    ...quad(p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1)),
    ...quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1)),
    ...quad(p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1)),
    ...quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1)),
    ...quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)),
    ...quad(p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), p(1, -1, -1)),
  ];
}

/** Exact box SDF (negative inside), the field the box triangles above are the exact zero set of. */
function boxSdf(x: number, y: number, z: number, center: MeshVertex, half: MeshVertex): number {
  const qx = Math.abs(x - center.x) - half.x;
  const qy = Math.abs(y - center.y) - half.y;
  const qz = Math.abs(z - center.z) - half.z;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  return outside + inside;
}

const cube = (center: MeshVertex, h: number): Triangle[] => boxTriangles(center, v(h, h, h));
const cubeSdf =
  (center: MeshVertex, h: number): Field =>
  (x, y, z) =>
    boxSdf(x, y, z, center, v(h, h, h));
const slabSdf =
  (center: MeshVertex, half: MeshVertex): Field =>
  (x, y, z) =>
    boxSdf(x, y, z, center, half);

/** Every fixture is measured at mm-per-unit 1, so "field units" and "saved mm" coincide and the numbers below can be read directly. */
const SCALE = 1;

function classify(tris: Triangle[], fieldAt: Field, sourceGridStepFieldUnits: number): SolidTopologyReport {
  return classifySolidTopology(tris, SCALE, { fieldAt, sourceGridStepFieldUnits });
}

/** Shells sorted largest-volume-first, so a fixture can be described by size instead of by discovery order. */
function byVolumeDesc(report: SolidTopologyReport): ShellStat[] {
  return [...report.shells].sort((a, b) => b.absoluteVolumeMm3 - a.absoluteVolumeMm3);
}

function counts(report: SolidTopologyReport): [number, number, number, number] {
  return [
    report.shellCount,
    report.solidComponentCount,
    report.closedCavityCount,
    report.ambiguousShellCount,
  ];
}

function fieldCounts(report: SolidTopologyReport): [number, number, number, number] {
  return [
    report.fieldAgreementCount,
    report.fieldInconclusiveCount,
    report.fieldContradictionCount,
    report.fieldInconsistentShellCount,
  ];
}

function assertEveryShellIsCleanSurface(report: SolidTopologyReport, label: string): void {
  for (const s of report.shells) {
    assert.equal(s.closed, true, `${label}: shell ${s.index} must be closed`);
    assert.equal(s.manifold, true, `${label}: shell ${s.index} must be manifold`);
    assert.equal(s.windingConsistent, true, `${label}: shell ${s.index} must be winding-consistent`);
    assert.deepEqual(s.crossesShells, [], `${label}: shell ${s.index} must cross nothing`);
  }
}

/** Deterministic order-shuffle (no RNG): odd/even split, odd half reversed — the same trick ringUnionPolicies.test.ts uses. */
function shuffled<T>(items: T[]): T[] {
  const odd = items.filter((_, i) => i % 2 === 1);
  const even = items.filter((_, i) => i % 2 === 0);
  return [...odd.reverse(), ...even];
}

// --- the fixtures themselves -------------------------------------------------
// Every nesting fixture keeps each shell's material wall thicker than that
// shell's own bbox-diagonal/8 offset ladder rung, because the CONTAINMENT
// representative is a deep point and a wall thinner than that makes the
// representative land inside the child shell. That limit is measured and pinned
// by C1-31 rather than hidden here.

/** 2: one cube with one enclosed cubic void. */
const F2_TRIS = [...cube(ORIGIN, 2), ...cube(ORIGIN, 0.5)];
const F2_FIELD: Field = (x, y, z) => Math.max(cubeSdf(ORIGIN, 2)(x, y, z), -cubeSdf(ORIGIN, 0.5)(x, y, z));

/** 3: three separate cubes, no nesting at all. */
const F3_CENTRES = [v(-3, 0, 0), ORIGIN, v(3, 0, 0)];
const F3_TRIS = F3_CENTRES.flatMap((c) => cube(c, 0.5));
const F3_FIELD: Field = (x, y, z) => Math.min(...F3_CENTRES.map((c) => cubeSdf(c, 0.5)(x, y, z)));

/** 4: cube with a cavity, plus a completely separate cube outside it. */
const F4_ISLAND = v(5, 0, 0);
const F4_TRIS = [...F2_TRIS, ...cube(F4_ISLAND, 0.5)];
const F4_FIELD: Field = (x, y, z) => Math.min(F2_FIELD(x, y, z), cubeSdf(F4_ISLAND, 0.5)(x, y, z));

/** 5: outer solid (3) ⊃ cavity (1.5) ⊃ solid island (0.4) — depths 0, 1, 2. */
const F5_TRIS = [...cube(ORIGIN, 3), ...cube(ORIGIN, 1.5), ...cube(ORIGIN, 0.4)];
const F5_FIELD: Field = (x, y, z) =>
  Math.min(
    Math.max(cubeSdf(ORIGIN, 3)(x, y, z), -cubeSdf(ORIGIN, 1.5)(x, y, z)),
    cubeSdf(ORIGIN, 0.4)(x, y, z),
  );

/** 6: four levels — solid (4) ⊃ cavity (2) ⊃ solid (1) ⊃ cavity (0.4). */
const F6_TRIS = [...cube(ORIGIN, 4), ...cube(ORIGIN, 2), ...cube(ORIGIN, 1), ...cube(ORIGIN, 0.4)];
const F6_FIELD: Field = (x, y, z) =>
  Math.min(
    Math.max(cubeSdf(ORIGIN, 4)(x, y, z), -cubeSdf(ORIGIN, 2)(x, y, z)),
    Math.max(cubeSdf(ORIGIN, 1)(x, y, z), -cubeSdf(ORIGIN, 0.4)(x, y, z)),
  );

/** 13: a cavity with a 3.0-thick material wall. */
const F13_TRIS = [...cube(ORIGIN, 4), ...cube(ORIGIN, 1)];
const F13_FIELD: Field = (x, y, z) => Math.max(cubeSdf(ORIGIN, 4)(x, y, z), -cubeSdf(ORIGIN, 1)(x, y, z));

/**
 * 14: a cavity whose material wall to the OUTSIDE is 0.1 thick — thinner than
 * this cavity's own representative offset (0.5105), so the deep mirror leaves
 * the object entirely, while every local probe distance (max 1.5 × 0.02 = 0.03)
 * stays inside the wall.
 */
const F14_CAVITY = { c: v(0, 0, 2.4), h: v(1.4, 1.4, 0.5) };
const F14_TRIS = [...cube(ORIGIN, 3), ...boxTriangles(F14_CAVITY.c, F14_CAVITY.h)];
const F14_FIELD: Field = (x, y, z) =>
  Math.max(cubeSdf(ORIGIN, 3)(x, y, z), -slabSdf(F14_CAVITY.c, F14_CAVITY.h)(x, y, z));
const F14_GRID_STEP = 0.02;

/**
 * 15: THE regression fixture for the audited defect. Two cavities separated by
 * a 0.1-thick material wall, both well inside a thick outer solid. The lower
 * cavity's deep representative offset is 0.5604 — five times the wall — so its
 * mirror crosses the wall, crosses the material, and lands in the OTHER void,
 * reading positive on both sides. The local probe (max 1.5 × 0.01 = 0.015)
 * stays inside the wall and finds the material.
 */
const F15_LOWER = { c: v(0, 0, -0.775), h: v(1.5, 1.5, 0.725) };
const F15_UPPER = { c: v(0, 0, 0.775), h: v(1.5, 1.5, 0.725) };
const F15_TRIS = [
  ...cube(ORIGIN, 3),
  ...boxTriangles(F15_LOWER.c, F15_LOWER.h),
  ...boxTriangles(F15_UPPER.c, F15_UPPER.h),
];
const F15_FIELD: Field = (x, y, z) =>
  Math.max(
    cubeSdf(ORIGIN, 3)(x, y, z),
    -slabSdf(F15_LOWER.c, F15_LOWER.h)(x, y, z),
    -slabSdf(F15_UPPER.c, F15_UPPER.h)(x, y, z),
  );
const F15_GRID_STEP = 0.01;
const F15_WALL_HALF_THICKNESS = 0.05;

/**
 * 16: a shell the field cannot explain. `Math.abs` of a box SDF is zero exactly
 * on that box's surface and POSITIVE on both sides of it — the shape linear
 * tetra interpolation emits a shell for while there is no material anywhere
 * near. Must never be rounded to "cavity wall".
 */
const F16_PHANTOM = v(10, 0, 0);
const F16_TRIS = [...cube(ORIGIN, 1), ...cube(F16_PHANTOM, 0.5)];
const F16_FIELD: Field = (x, y, z) =>
  Math.min(cubeSdf(ORIGIN, 1)(x, y, z), Math.abs(cubeSdf(F16_PHANTOM, 0.5)(x, y, z)));

/** 17: the mesh sits 0.5 away from the field's zero everywhere, so the measured band is exactly 0.5 and no probe within 1.5 grid steps can get outside it. */
const F17_OFFSET = 0.5;
const F17_FIELD: Field = (x, y, z) => cubeSdf(ORIGIN, 1)(x, y, z) + F17_OFFSET;

/** 18: the field's material really is OUTSIDE the cube — a boundary is resolved, oriented opposite to the containment parity. */
const F18_FIELD: Field = (x, y, z) => -cubeSdf(ORIGIN, 1)(x, y, z);

const DEFAULT_GRID_STEP = 0.05;

// ===========================================================================
// 1. The eighteen fixtures
// ===========================================================================

test("C1-1: fixture 1 — one cube is one solid, no cavity, no ambiguity, and the field agrees", () => {
  const r = classify(cube(ORIGIN, 1), cubeSdf(ORIGIN, 1), DEFAULT_GRID_STEP);
  assert.deepEqual(counts(r), [1, 1, 0, 0]);
  assert.deepEqual(fieldCounts(r), [1, 0, 0, 0]);
  assertEveryShellIsCleanSurface(r, "F1");
  assert.equal(r.shells[0].kind, "outer-boundary");
  assert.equal(r.shells[0].containmentDepth, 0);
  assert.equal(r.shells[0].parentShell, null);
  assert.equal(r.shells[0].fieldCheck, "agrees");
  assert.equal(r.shells[0].fieldConfirmed, true);
});

test("C1-2: fixture 2 — cube + enclosed cavity is ONE solid with ONE cavity, not two pieces", () => {
  const r = classify(F2_TRIS, F2_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(counts(r), [2, 1, 1, 0]);
  assert.deepEqual(fieldCounts(r), [2, 0, 0, 0]);
  const [outer, cavity] = byVolumeDesc(r);
  assert.equal(outer.kind, "outer-boundary");
  assert.equal(outer.containmentDepth, 0);
  assert.equal(cavity.kind, "cavity-wall");
  assert.equal(cavity.containmentDepth, 1);
  assert.equal(cavity.parentShell, outer.index);
});

test("C1-3: fixture 3 — three disjoint cubes are three solids at depth 0", () => {
  const r = classify(F3_TRIS, F3_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(counts(r), [3, 3, 0, 0]);
  assert.deepEqual(fieldCounts(r), [3, 0, 0, 0]);
  for (const s of r.shells) {
    assert.equal(s.containmentDepth, 0);
    assert.equal(s.kind, "outer-boundary");
    assert.deepEqual(s.containedBy, []);
  }
});

test("C1-4: fixture 4 — outer + cavity + a separate external cube is two solids and one cavity", () => {
  const r = classify(F4_TRIS, F4_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(counts(r), [3, 2, 1, 0]);
  assert.deepEqual(fieldCounts(r), [3, 0, 0, 0]);
  const cavities = r.shells.filter((s) => s.kind === "cavity-wall");
  assert.equal(cavities.length, 1);
  assert.equal(cavities[0].containmentDepth, 1);
});

test("C1-5: fixture 5 — a solid island inside a cavity is depth 2, and counts as a second solid", () => {
  const r = classify(F5_TRIS, F5_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(counts(r), [3, 2, 1, 0]);
  assert.deepEqual(fieldCounts(r), [3, 0, 0, 0]);
  const [outer, cavity, island] = byVolumeDesc(r);
  assert.deepEqual(
    [outer.containmentDepth, cavity.containmentDepth, island.containmentDepth],
    [0, 1, 2],
  );
  assert.deepEqual([outer.kind, cavity.kind, island.kind], [
    "outer-boundary",
    "cavity-wall",
    "outer-boundary",
  ]);
  // The parent is the SMALLEST containing shell, so the island's parent is the
  // cavity and not the outer boundary.
  assert.equal(island.parentShell, cavity.index);
  assert.equal(cavity.parentShell, outer.index);
});

test("C1-6: fixture 6 — depth-3 nesting resolves to 2 solids + 2 cavities with a chained parent at every level", () => {
  const r = classify(F6_TRIS, F6_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(counts(r), [4, 2, 2, 0]);
  assert.deepEqual(fieldCounts(r), [4, 0, 0, 0]);
  const ordered = byVolumeDesc(r);
  assert.deepEqual(ordered.map((s) => s.containmentDepth), [0, 1, 2, 3]);
  assert.deepEqual(ordered.map((s) => s.kind), [
    "outer-boundary",
    "cavity-wall",
    "outer-boundary",
    "cavity-wall",
  ]);
  for (let i = 1; i < ordered.length; i++) {
    assert.equal(ordered[i].parentShell, ordered[i - 1].index, `level ${i}'s parent must be level ${i - 1}`);
  }
});

test("C1-7: fixture 7 — emitting the same shells in reverse order changes indices only, not the classification", () => {
  const base = classify(F5_TRIS, F5_FIELD, DEFAULT_GRID_STEP);
  const reversed = classify(
    [...cube(ORIGIN, 0.4), ...cube(ORIGIN, 1.5), ...cube(ORIGIN, 3)],
    F5_FIELD,
    DEFAULT_GRID_STEP,
  );
  assert.deepEqual(counts(reversed), counts(base));
  assert.deepEqual(fieldCounts(reversed), fieldCounts(base));
  assert.deepEqual(
    byVolumeDesc(reversed).map((s) => [s.containmentDepth, s.kind, s.fieldCheck]),
    byVolumeDesc(base).map((s) => [s.containmentDepth, s.kind, s.fieldCheck]),
  );
});

test("C1-8: fixture 8 — shuffling the triangle order changes indices only, not the classification", () => {
  const base = classify(F5_TRIS, F5_FIELD, DEFAULT_GRID_STEP);
  const mixed = classify(shuffled(F5_TRIS), F5_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(counts(mixed), counts(base));
  assert.deepEqual(fieldCounts(mixed), fieldCounts(base));
  assert.deepEqual(
    byVolumeDesc(mixed).map((s) => [s.containmentDepth, s.kind, s.fieldCheck]),
    byVolumeDesc(base).map((s) => [s.containmentDepth, s.kind, s.fieldCheck]),
  );
});

test("C1-9: fixture 9 — reversing the input winding flips every normal and changes nothing (the probe reads the tester, not the normal's sign)", () => {
  const base = classify(F5_TRIS, F5_FIELD, DEFAULT_GRID_STEP);
  const flipped = classify(
    F5_TRIS.map((t) => ({ a: t.a, b: t.c, c: t.b })),
    F5_FIELD,
    DEFAULT_GRID_STEP,
  );
  assert.deepEqual(counts(flipped), counts(base));
  assert.deepEqual(fieldCounts(flipped), fieldCounts(base));
  assert.deepEqual(
    byVolumeDesc(flipped).map((s) => [s.containmentDepth, s.kind, s.fieldCheck]),
    byVolumeDesc(base).map((s) => [s.containmentDepth, s.kind, s.fieldCheck]),
  );
  // The signed volumes really did flip — the input is genuinely different, and
  // the classification is invariant rather than accidentally unchanged.
  const a = byVolumeDesc(base).map((s) => Math.sign(s.signedVolumeMm3));
  const b = byVolumeDesc(flipped).map((s) => Math.sign(s.signedVolumeMm3));
  assert.deepEqual(b, a.map((sign) => -sign));
});

test("C1-10: fixture 10 — translating mesh and field 100+ units from the origin changes nothing", () => {
  const base = classify(F5_TRIS, F5_FIELD, DEFAULT_GRID_STEP);
  const off = v(100, -50, 30);
  const shift = (p: MeshVertex): MeshVertex => v(p.x + off.x, p.y + off.y, p.z + off.z);
  const moved = classify(
    F5_TRIS.map((t) => ({ a: shift(t.a), b: shift(t.b), c: shift(t.c) })),
    (x, y, z) => F5_FIELD(x - off.x, y - off.y, z - off.z),
    DEFAULT_GRID_STEP,
  );
  assert.deepEqual(counts(moved), counts(base));
  assert.deepEqual(fieldCounts(moved), fieldCounts(base));
  assert.deepEqual(
    byVolumeDesc(moved).map((s) => [s.containmentDepth, s.kind]),
    byVolumeDesc(base).map((s) => [s.containmentDepth, s.kind]),
  );
});

test("C1-11: fixture 11 — an open shell is ambiguous on its open edges, and is never counted as a solid or a cavity", () => {
  // The cube minus its +x face: 10 triangles, 4 boundary edges.
  const r = classify(cube(ORIGIN, 1).slice(2), cubeSdf(ORIGIN, 1), DEFAULT_GRID_STEP);
  assert.deepEqual(counts(r), [1, 0, 0, 1]);
  const shell = r.shells[0];
  assert.equal(shell.kind, "ambiguous");
  assert.equal(shell.closed, false);
  assert.equal(shell.openEdges, 4);
  assert.equal(shell.containmentDepth, null);
  assert.ok(
    shell.ambiguousReasons.some((s) => s.includes("開いた辺")),
    `the open edges must be stated as the reason, got ${JSON.stringify(shell.ambiguousReasons)}`,
  );
  assert.equal(r.containmentResolved, false);
  assert.equal(r.safeToOrient, false);
  assert.equal(r.safeForGate, false);
});

test("C1-12: fixture 12 — two intersecting shells are ambiguous, and each names the other as the shell it crosses", () => {
  const other = v(0.5, 0.37, 0.23);
  const r = classify(
    [...cube(ORIGIN, 1), ...cube(other, 1)],
    (x, y, z) => Math.min(cubeSdf(ORIGIN, 1)(x, y, z), cubeSdf(other, 1)(x, y, z)),
    DEFAULT_GRID_STEP,
  );
  assert.deepEqual(counts(r), [2, 0, 0, 2]);
  assert.deepEqual(r.shells[0].crossesShells, [1]);
  assert.deepEqual(r.shells[1].crossesShells, [0]);
  for (const s of r.shells) {
    assert.equal(s.kind, "ambiguous");
    assert.ok(s.ambiguousReasons.some((x) => x.includes("交差")));
  }
  assert.equal(r.safeForGate, false);
});

test("C1-13: fixture 13 — a cavity with a 3.0-thick wall: local probe and deep mirror BOTH agree", () => {
  const r = classify(F13_TRIS, F13_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(counts(r), [2, 1, 1, 0]);
  assert.deepEqual(fieldCounts(r), [2, 0, 0, 0]);
  const [, cavity] = byVolumeDesc(r);
  assert.equal(cavity.kind, "cavity-wall");
  assert.equal(cavity.fieldCheck, "agrees");
  // With a wall this thick the deep mirror lands in material too, so the old
  // check would have agreed as well. This fixture is the CONTRAST for 14/15.
  assert.equal(cavity.deepMirrorFieldCheck, "agrees");
  assert.ok(cavity.representative!.offsetMm < 3.0, "the deep offset is smaller than the wall here");
});

test("C1-14: fixture 14 — a cavity with a 0.1-thick wall is still a cavity: the local probe agrees where the deep mirror leaves the object", () => {
  const r = classify(F14_TRIS, F14_FIELD, F14_GRID_STEP);
  assert.deepEqual(counts(r), [2, 1, 1, 0]);
  assert.deepEqual(fieldCounts(r), [2, 0, 0, 0]);
  const [, cavity] = byVolumeDesc(r);
  assert.equal(cavity.kind, "cavity-wall");
  assert.equal(cavity.containmentDepth, 1);
  assert.equal(cavity.fieldCheck, "agrees");
  // The deep offset is 5x the wall, so the mirror is outside the object and
  // reads positive on both sides — the old check could not have concluded this.
  assert.ok(
    cavity.representative!.offsetMm > 5 * 0.1,
    `deep offset ${cavity.representative!.offsetMm} must exceed the 0.1 wall`,
  );
  assert.equal(cavity.deepMirrorFieldCheck, "field-inconsistent-shell");
  assert.ok(cavity.fieldInside! > 0 && cavity.fieldOutside! > 0, "both deep readings are positive");
  // …while every local probe distance stays inside the wall.
  const maxProbe = Math.max(
    ...cavity.fieldProbeTriangles.flatMap((p) => p.samples.map((s) => s.distanceFieldUnits)),
  );
  assert.ok(maxProbe < 0.1, `max local probe distance ${maxProbe} must stay inside the 0.1 wall`);
});

test("C1-15: fixture 15 — REGRESSION: the deep mirror crosses a thin wall into the NEXT void; only the local probe finds the material", () => {
  const r = classify(F15_TRIS, F15_FIELD, F15_GRID_STEP);
  assert.deepEqual(counts(r), [3, 1, 2, 0]);
  assert.deepEqual(fieldCounts(r), [3, 0, 0, 0]);
  const [outer, ...cavities] = byVolumeDesc(r);
  assert.equal(outer.kind, "outer-boundary");
  for (const c of cavities) {
    assert.equal(c.kind, "cavity-wall");
    assert.equal(c.containmentDepth, 1);
    assert.equal(c.fieldCheck, "agrees");
  }
  // Shell 1 is the LOWER cavity, whose first-picked probe face is the one
  // against the thin wall. Its deep mirror overshoots into the upper cavity.
  const lower = r.shells[1];
  assert.equal(lower.kind, "cavity-wall");
  assert.equal(lower.deepMirrorFieldCheck, "field-inconsistent-shell");
  assert.ok(
    lower.fieldInside! > lower.fieldBand!.decision && lower.fieldOutside! > lower.fieldBand!.decision,
    `the deep pair reads confidently POSITIVE on both sides: in=${lower.fieldInside}, out=${lower.fieldOutside}, band=${lower.fieldBand!.decision}`,
  );
  assert.ok(
    lower.representative!.offsetMm > 5 * F15_WALL_HALF_THICKNESS * 2,
    `the deep offset ${lower.representative!.offsetMm} must be several times the 0.1 wall`,
  );
  // The local probe, at the same shell, resolves the boundary and agrees.
  assert.equal(lower.fieldCheck, "agrees");
  assert.equal(lower.fieldProbeTally.agree, 3);
  assert.equal(lower.fieldProbeTally.contradict, 0);
  assert.equal(lower.fieldProbeTally.sameSign, 0);
  const maxProbe = Math.max(
    ...lower.fieldProbeTriangles.flatMap((p) => p.samples.map((s) => s.distanceFieldUnits)),
  );
  assert.ok(
    maxProbe < F15_WALL_HALF_THICKNESS,
    `max local probe distance ${maxProbe} must stay inside the half-wall ${F15_WALL_HALF_THICKNESS}`,
  );
  // Shell 2 is the UPPER cavity, whose first-picked face is the far one, so its
  // deep mirror happens to land in material. The two shells get the same final
  // answer from the local probe either way — which is the point.
  assert.equal(r.shells[2].deepMirrorFieldCheck, "agrees");
  assert.equal(r.shells[2].fieldCheck, "agrees");
});

test("C1-16: fixture 16 — a shell with positive field on BOTH sides is field-inconsistent, and is never counted as a cavity", () => {
  const r = classify(F16_TRIS, F16_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(counts(r), [2, 1, 0, 1]);
  assert.deepEqual(fieldCounts(r), [1, 0, 0, 1]);
  const phantom = byVolumeDesc(r)[1];
  assert.equal(phantom.fieldCheck, "field-inconsistent-shell");
  assert.equal(phantom.kind, "ambiguous");
  assert.equal(phantom.fieldConfirmed, false);
  assert.equal(phantom.fieldProbeTally.sameSign, 3);
  assert.equal(phantom.fieldProbeTally.agree, 0);
  // Its containment parity WAS available (depth 0 by containment) — the field
  // is what refused it, and it is not rounded to the parity's answer.
  assert.equal(r.containmentResolved, true);
  assert.equal(phantom.containmentDepth, null);
  assert.equal(r.closedCavityCount, 0);
  assert.ok(
    phantom.ambiguousReasons.some((s) => s.includes("空洞壁とは判定しない")),
    `the refusal must be stated, got ${JSON.stringify(phantom.ambiguousReasons)}`,
  );
  assert.equal(r.safeForGate, false);
});

test("C1-17: fixture 17 — probes inside the measured band are INCONCLUSIVE, not a contradiction, and the shell keeps its containment kind", () => {
  const r = classify(cube(ORIGIN, 1), F17_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(counts(r), [1, 1, 0, 0]);
  assert.deepEqual(fieldCounts(r), [0, 1, 0, 0]);
  const shell = r.shells[0];
  assert.equal(shell.fieldCheck, "inconclusive");
  assert.equal(shell.fieldConfirmed, false);
  assert.equal(shell.fieldAgreesWithParity, null);
  // The containment answer stands — an absent measurement is not a refusal.
  assert.equal(shell.kind, "outer-boundary");
  assert.equal(shell.containmentDepth, 0);
  assert.deepEqual(shell.ambiguousReasons, []);
  assert.ok(shell.fieldNotes.length > 0, "the reason the field could not confirm it must be stated");
  assert.equal(r.fieldContradictionCount, 0);
  assert.equal(r.fieldInconsistentShellCount, 0);
});

test("C1-18: fixture 18 — a field whose material is genuinely on the other side CONTRADICTS the containment parity", () => {
  const r = classify(cube(ORIGIN, 1), F18_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(counts(r), [1, 0, 0, 1]);
  assert.deepEqual(fieldCounts(r), [0, 0, 1, 0]);
  const shell = r.shells[0];
  assert.equal(shell.fieldCheck, "contradicts");
  assert.equal(shell.fieldAgreesWithParity, false);
  assert.equal(shell.kind, "ambiguous");
  assert.equal(shell.fieldProbeTally.contradict, 3);
  assert.ok(shell.ambiguousReasons.some((s) => s.includes("逆向きの境界")));
  assert.equal(r.safeForGate, false);
});

// ===========================================================================
// 2. The mechanism: two measurements, a distance sweep, a four-number band
// ===========================================================================

test("C1-19: the containment representative and the field probe are two DIFFERENT measurements — different points, at different distances", () => {
  const r = classify(F15_TRIS, F15_FIELD, F15_GRID_STEP);
  for (const shell of r.shells) {
    const rep = shell.representative!;
    assert.ok(rep.offsetMm > 0);
    for (const probe of shell.fieldProbeTriangles) {
      for (const sample of probe.samples) {
        // No probe distance coincides with the containment offset…
        assert.notEqual(
          sample.distanceMm,
          rep.offsetMm,
          `shell ${shell.index}: probe distance must differ from the containment offset`,
        );
        assert.ok(
          sample.distanceMm < rep.offsetMm,
          `shell ${shell.index}: the local probe (${sample.distanceMm}) must stay nearer than the deep representative (${rep.offsetMm})`,
        );
        // …and no probe point coincides with the representative or its mirror.
        for (const point of [sample.plusPointMm, sample.minusPointMm]) {
          for (const deep of [rep.point, rep.outsidePoint]) {
            assert.ok(
              Math.hypot(point.x - deep.x, point.y - deep.y, point.z - deep.z) > 0,
              `shell ${shell.index}: a probe point must not be the containment point`,
            );
          }
        }
      }
    }
  }
});

test("C1-20: the local probe sweeps exactly 0.125 / 0.25 / 0.5 / 1.0 / 1.5 × the SUPPLIED grid step, on at least 3 triangles", () => {
  assert.deepEqual([...LOCAL_PROBE_GRID_STEP_MULTIPLES], [0.125, 0.25, 0.5, 1.0, 1.5]);
  const step = 0.017; // deliberately not the default, and not derivable from the fixture's size
  const r = classify(F13_TRIS, F13_FIELD, step);
  for (const shell of r.shells) {
    assert.ok(
      shell.fieldProbeTriangles.length >= 3,
      `shell ${shell.index}: at least 3 probe triangles, got ${shell.fieldProbeTriangles.length}`,
    );
    // The probe triangles are large and mutually distant, not three neighbours.
    const centroids = shell.fieldProbeTriangles.map((p) => p.centroidMm);
    for (let i = 0; i < centroids.length; i++) {
      for (let j = i + 1; j < centroids.length; j++) {
        const d = Math.hypot(
          centroids[i].x - centroids[j].x,
          centroids[i].y - centroids[j].y,
          centroids[i].z - centroids[j].z,
        );
        assert.ok(d > 0, "probe triangles must be distinct");
      }
    }
    for (const probe of shell.fieldProbeTriangles) {
      assert.deepEqual(
        probe.samples.map((s) => s.gridStepMultiple),
        [...LOCAL_PROBE_GRID_STEP_MULTIPLES],
      );
      for (const sample of probe.samples) {
        assert.equal(sample.distanceFieldUnits, sample.gridStepMultiple * step);
        // scaleMmPerUnit is 1 in these fixtures, so the two agree here — the
        // conversion itself is exercised on the real hosts below.
        assert.equal(sample.distanceMm, sample.distanceFieldUnits * SCALE);
      }
    }
  }
});

test("C1-21: the probe distance comes from the grid step ALONE — a different grid step on the same mesh moves every probe point", () => {
  const a = classify(F13_TRIS, F13_FIELD, 0.01);
  const b = classify(F13_TRIS, F13_FIELD, 0.09);
  const distancesOf = (r: SolidTopologyReport): number[] =>
    r.shells.flatMap((s) => s.fieldProbeTriangles.flatMap((p) => p.samples.map((x) => x.distanceMm)));
  const da = distancesOf(a);
  const db = distancesOf(b);
  assert.equal(da.length, db.length);
  for (let i = 0; i < da.length; i++) assert.ok(Math.abs(db[i] / da[i] - 9) < 1e-9);
  // The shells' own bounding boxes are identical, so nothing about the probe
  // distance can have come from them.
  assert.deepEqual(
    a.shells.map((s) => s.bboxMm),
    b.shells.map((s) => s.bboxMm),
  );
});

test("C1-22: without a grid step the field is still READ but no verdict is claimed — inconclusive, with the reason stated", () => {
  const withStep = classifySolidTopology(F13_TRIS, SCALE, {
    fieldAt: F13_FIELD,
    sourceGridStepFieldUnits: DEFAULT_GRID_STEP,
  });
  const without = classifySolidTopology(F13_TRIS, SCALE, { fieldAt: F13_FIELD });
  assert.equal(withStep.fieldAgreementCount, 2);
  assert.equal(without.fieldAgreementCount, 0);
  assert.equal(without.fieldInconclusiveCount, 2);
  assert.equal(without.fieldChecked, true, "a field WAS supplied — fieldChecked cannot say more than that");
  assert.equal(without.fieldFullyConfirmed, false);
  for (const s of without.shells) {
    assert.equal(s.fieldCheck, "inconclusive");
    assert.deepEqual(s.fieldProbeTriangles, [], "no probe was run");
    assert.ok(s.fieldInside !== null && s.fieldOutside !== null, "the deep values are still reported");
    assert.ok(s.fieldNotes.some((n) => n.includes("sourceGridStepFieldUnits")));
  }
  // The containment classification is unaffected: no verdict is invented, and
  // none is thrown away either.
  assert.deepEqual(counts(without), counts(withStep));
});

test("C1-23: the band reports p50 / p90 / p99 / max, and the threshold used is p90 — stated, not implied", () => {
  const r = classify(cube(ORIGIN, 1), F17_FIELD, DEFAULT_GRID_STEP);
  const band = r.shells[0].fieldBand!;
  // This fixture puts the mesh exactly 0.5 from the field's zero at EVERY
  // vertex, so all four statistics are that same 0.5 by construction.
  assert.equal(band.p50, F17_OFFSET);
  assert.equal(band.p90, F17_OFFSET);
  assert.equal(band.p99, F17_OFFSET);
  assert.equal(band.max, F17_OFFSET);
  assert.equal(band.decision, F17_OFFSET);
  assert.equal(r.shells[0].fieldBandFieldUnits, band.decision);
  assert.ok(band.sampleCount > 0);

  // On a shell whose vertices are exactly on the zero set the band collapses to
  // EPSILON rather than to 0 — a zero band would make every probe "confident".
  const exact = classify(cube(ORIGIN, 1), cubeSdf(ORIGIN, 1), DEFAULT_GRID_STEP);
  const exactBand = exact.shells[0].fieldBand!;
  assert.equal(exactBand.max, 0);
  assert.equal(exactBand.decision, Number.EPSILON);
});

test("C1-24: the four band statistics are ordered p50 <= p90 <= p99 <= max on a real, uneven surface", () => {
  // Two intersecting cubes: each shell's vertices sit at a wide spread of |field|.
  const other = v(0.5, 0.37, 0.23);
  const r = classify(
    [...cube(ORIGIN, 1), ...cube(other, 1)],
    (x, y, z) => Math.min(cubeSdf(ORIGIN, 1)(x, y, z), cubeSdf(other, 1)(x, y, z)),
    DEFAULT_GRID_STEP,
  );
  for (const s of r.shells) {
    const b = s.fieldBand!;
    assert.ok(b.p50 <= b.p90 && b.p90 <= b.p99 && b.p99 <= b.max, `band out of order: ${JSON.stringify(b)}`);
    assert.ok(b.max > b.p50, "this fixture really does have a spread — the ordering is not vacuous");
    assert.equal(b.decision, Math.max(b.p90, Number.EPSILON));
  }
});

test("C1-25: a probe reading is confident only OUTSIDE the band, and one confident side alone never resolves anything", () => {
  const r = classify(cube(ORIGIN, 1), F17_FIELD, DEFAULT_GRID_STEP);
  const shell = r.shells[0];
  const band = shell.fieldBand!.decision;
  let sawOneSidedConfidence = false;
  for (const probe of shell.fieldProbeTriangles) {
    for (const s of probe.samples) {
      const plusConfident = Math.abs(s.plusValue) > band;
      const minusConfident = Math.abs(s.minusValue) > band;
      assert.equal(s.resolved, false, "nothing may resolve while one side is inside the band");
      assert.equal(s.sameSign, false);
      if (plusConfident !== minusConfident) sawOneSidedConfidence = true;
    }
  }
  assert.ok(sawOneSidedConfidence, "this fixture really does have one confident side — the assertion is not vacuous");
});

test("C1-26: `inconclusive` is not a contradiction: the shell keeps its kind, and only the CONFIRMATION is withheld", () => {
  const r = classify(cube(ORIGIN, 1), F17_FIELD, DEFAULT_GRID_STEP);
  const shell = r.shells[0];
  assert.equal(shell.fieldCheck, "inconclusive");
  assert.equal(shell.kind, "outer-boundary");
  assert.equal(shell.fieldConfirmed, false);
  assert.equal(r.ambiguousShellCount, 0);
  assert.equal(r.containmentResolved, true);
  assert.equal(r.safeToOrient, true);
  // Nothing measured argues against the gate here; what is missing is
  // corroboration, and `fieldFullyConfirmed` is the flag that says so.
  assert.equal(r.safeForGate, true);
  assert.equal(r.fieldFullyConfirmed, false);
});

test("C1-27: a field-inconsistent shell is counted in its own bucket and in NEITHER the solid nor the cavity total", () => {
  const r = classify(F16_TRIS, F16_FIELD, DEFAULT_GRID_STEP);
  assert.equal(r.fieldInconsistentShellCount, 1);
  assert.equal(r.closedCavityCount, 0);
  assert.equal(r.solidComponentCount, 1);
  assert.equal(r.ambiguousShellCount, 1);
  assert.equal(
    r.solidComponentCount + r.closedCavityCount + r.ambiguousShellCount,
    r.shellCount,
    "the three kind counts must still exhaust the shells",
  );
  for (const s of r.shells) {
    if (s.fieldCheck === "field-inconsistent-shell") assert.equal(s.kind, "ambiguous");
  }
});

test("C1-28: the four field counts exhaust every shell whenever a field was supplied", () => {
  const cases: Array<[string, SolidTopologyReport]> = [
    ["F5", classify(F5_TRIS, F5_FIELD, DEFAULT_GRID_STEP)],
    ["F6", classify(F6_TRIS, F6_FIELD, DEFAULT_GRID_STEP)],
    ["F15", classify(F15_TRIS, F15_FIELD, F15_GRID_STEP)],
    ["F16", classify(F16_TRIS, F16_FIELD, DEFAULT_GRID_STEP)],
    ["F17", classify(cube(ORIGIN, 1), F17_FIELD, DEFAULT_GRID_STEP)],
    ["F18", classify(cube(ORIGIN, 1), F18_FIELD, DEFAULT_GRID_STEP)],
  ];
  for (const [label, r] of cases) {
    const [a, i, c, x] = fieldCounts(r);
    assert.equal(a + i + c + x, r.shellCount, `${label}: field counts must exhaust the shells`);
    assert.equal(a, r.shells.filter((s) => s.fieldCheck === "agrees").length, label);
    assert.equal(a, r.shells.filter((s) => s.fieldConfirmed).length, `${label}: fieldConfirmed <-> "agrees"`);
  }
  // With no field at all, every shell is "not-measured" and no bucket claims it.
  const none = classifySolidTopology(F5_TRIS, SCALE, {});
  assert.equal(none.fieldChecked, false);
  assert.deepEqual(fieldCounts(none), [0, 0, 0, 0]);
  assert.equal(none.fieldFullyConfirmed, false);
  for (const s of none.shells) assert.equal(s.fieldCheck, "not-measured");
});

test("C1-29: the four resolved flags each mean one thing, and they really do come apart", () => {
  const allGood = classify(F5_TRIS, F5_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(
    [allGood.containmentResolved, allGood.fieldFullyConfirmed, allGood.safeToOrient, allGood.safeForGate],
    [true, true, true, true],
  );

  // Containment fine, field silent: orientable and nothing argues against the
  // gate, but nothing confirmed it either.
  const unconfirmed = classify(cube(ORIGIN, 1), F17_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(
    [
      unconfirmed.containmentResolved,
      unconfirmed.fieldFullyConfirmed,
      unconfirmed.safeToOrient,
      unconfirmed.safeForGate,
    ],
    [true, false, true, true],
  );

  // Containment fine, field refuses one shell: no longer orientable, no gate.
  const refused = classify(F16_TRIS, F16_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(
    [refused.containmentResolved, refused.fieldFullyConfirmed, refused.safeToOrient, refused.safeForGate],
    [true, false, false, false],
  );

  // Containment itself fails (an open shell): every flag but the field's is false.
  const open = classify(cube(ORIGIN, 1).slice(2), cubeSdf(ORIGIN, 1), DEFAULT_GRID_STEP);
  assert.deepEqual(
    [open.containmentResolved, open.safeToOrient, open.safeForGate],
    [false, false, false],
  );

  // A contradiction alone is enough to close the gate.
  const contra = classify(cube(ORIGIN, 1), F18_FIELD, DEFAULT_GRID_STEP);
  assert.deepEqual(
    [contra.containmentResolved, contra.fieldFullyConfirmed, contra.safeToOrient, contra.safeForGate],
    [true, false, false, false],
  );
});

test("C1-30: the summary never claims 「場の符号で照合済み」 — it states the breakdown, inconclusive shells included", () => {
  const partly = classify(cube(ORIGIN, 1), F17_FIELD, DEFAULT_GRID_STEP);
  const line = solidTopologySummary(partly);
  assert.ok(!line.includes("照合済み"), `must not claim a completed check: ${line}`);
  assert.ok(line.includes("field照合: 一致 0 / 不確定 1 / 矛盾 0 / 場と不整合なshell 0"), line);

  const clean = solidTopologySummary(classify(F5_TRIS, F5_FIELD, DEFAULT_GRID_STEP));
  assert.ok(clean.includes("field照合: 一致 3 / 不確定 0 / 矛盾 0 / 場と不整合なshell 0"), clean);
  assert.ok(!clean.includes("照合済み"), clean);

  const refused = solidTopologySummary(classify(F16_TRIS, F16_FIELD, DEFAULT_GRID_STEP));
  assert.ok(refused.includes("判定不能 1"), refused);
  assert.ok(refused.includes("場と不整合なshell 1"), refused);

  const noField = solidTopologySummary(classifySolidTopology(F5_TRIS, SCALE, {}));
  assert.ok(noField.includes("場の照合なし"), noField);
});

test("C1-31: MEASURED limit — the containment representative is deep, so a wall thinner than its own offset breaks the CONTAINMENT stage before the field is consulted", () => {
  // A 0.1-thick spherical-ish shell: outer 2.0, cavity 1.9. Both shells' deep
  // representatives land inside the cavity, so both read depth 1 and the chain
  // is not a chain. This is a property of the containment machinery, which this
  // round did not change; it is recorded here so the limit is not rediscovered
  // as a surprise. Fixtures 14 and 15 keep their walls thin only BETWEEN
  // voids, where the representative still lands correctly.
  const tris = [...cube(ORIGIN, 2), ...cube(ORIGIN, 1.9)];
  const field: Field = (x, y, z) => Math.max(cubeSdf(ORIGIN, 2)(x, y, z), -cubeSdf(ORIGIN, 1.9)(x, y, z));
  const r = classify(tris, field, DEFAULT_GRID_STEP);
  assert.deepEqual(counts(r), [2, 0, 0, 2]);
  assert.equal(r.containmentResolved, false);
  for (const s of r.shells) {
    assert.ok(
      s.representative!.offsetMm > 0.1,
      `the deep offset ${s.representative!.offsetMm} exceeds the 0.1 wall, which is the cause`,
    );
    assert.ok(
      s.ambiguousReasons.some((x) => x.includes("包含の入れ子が連鎖していない")),
      `the containment stage is what failed: ${JSON.stringify(s.ambiguousReasons)}`,
    );
  }
});

test("C1-32: orientation is read ONCE per probe triangle from the tester, and survives distances that leave the shell", () => {
  // A 0.02-thick plate: the probe ladder's near rungs stay inside it and the
  // far ones do not, so the tester stops separating the two sides partway up
  // while the surface's inside is obviously unchanged.
  const plate = { c: ORIGIN, h: v(2, 2, 0.01) };
  const r = classify(
    boxTriangles(plate.c, plate.h),
    slabSdf(plate.c, plate.h),
    DEFAULT_GRID_STEP,
  );
  assert.deepEqual(counts(r), [1, 1, 0, 0]);
  assert.equal(r.shells[0].fieldCheck, "agrees");
  let sawOrientationOutliveTheTester = false;
  for (const shell of r.shells) {
    for (const probe of shell.fieldProbeTriangles) {
      if (probe.insideSide === null) continue;
      assert.equal(
        probe.insideSide,
        probe.samples.find((s) => s.insideSide !== null)!.insideSide,
        "the triangle's orientation is the nearest distance that resolved it",
      );
      assert.equal(
        probe.insideSideFromGridStepMultiple,
        probe.samples.find((s) => s.insideSide !== null)!.gridStepMultiple,
      );
      if (probe.samples.some((s) => s.insideSide === null)) sawOrientationOutliveTheTester = true;
    }
  }
  assert.ok(
    sawOrientationOutliveTheTester,
    "this fixture really does have distances where the tester stops answering — the assertion is not vacuous",
  );
});

test("C1-33: the verdict comes from the NEAREST informative distance, never from a farther one", () => {
  const reports = [
    classify(F15_TRIS, F15_FIELD, F15_GRID_STEP),
    classify(F16_TRIS, F16_FIELD, DEFAULT_GRID_STEP),
    classify(F13_TRIS, F13_FIELD, DEFAULT_GRID_STEP),
  ];
  for (const r of reports) {
    for (const shell of r.shells) {
      for (const probe of shell.fieldProbeTriangles) {
        const first = probe.samples.find((s) => s.resolved || s.sameSign) ?? null;
        assert.equal(probe.decidingGridStepMultiple, first === null ? null : first.gridStepMultiple);
        assert.equal(
          probe.decidingReading,
          first === null ? null : first.resolved ? "resolved" : "same-sign",
        );
        if (first === null) assert.equal(probe.verdict, "inconclusive");
      }
    }
  }
});

test("C1-34: safeToOrient and fieldFullyConfirmed stay separate before T2 is connected", () => {
  const unconfirmed = classify(cube(ORIGIN, 1), F17_FIELD, DEFAULT_GRID_STEP);
  assert.notEqual(unconfirmed.safeToOrient, unconfirmed.fieldFullyConfirmed);
  const refused = classify(F16_TRIS, F16_FIELD, DEFAULT_GRID_STEP);
  assert.equal(refused.safeToOrient, false);
});

// ===========================================================================
// 3. The three real ring-constrained hosts at resolution 64
// ===========================================================================
// Pinned to what THIS ROUND measured. Where the local probe could not confirm a
// shell, the assertion says "inconclusive" and pins that — not "correct".

const PRODUCTION_RESOLUTION = 64;
const REAL_HOSTS: HostFixtureId[] = ["box", "sphere", "waisted"];

interface RealHostMeasurement {
  report: SolidTopologyReport;
  gridStepFieldUnits: number;
  scaleMmPerUnit: number;
}

const realCache = new Map<HostFixtureId, RealHostMeasurement>();

function realHost(hostId: HostFixtureId): RealHostMeasurement {
  const cached = realCache.get(hostId);
  if (cached) return cached;
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
  const result: GrowthResult = growNetwork(
    hostId,
    envelope,
    { ...DEFAULT_GROWTH_PARAMS, targetSurfaceCoverage: 0.25 },
    "ring-constrained",
    fit.scaleMmPerUnit,
  );
  const blendK = result.params.unitRadius * 0.3;
  const mesh = buildCandidateMesh(result, PRODUCTION_RESOLUTION, blendK);

  // The SAME field and the SAME grid step buildCandidateMesh sampled — the real
  // `bounds.longest / resolution`, not a fraction of anything's bounding box.
  const axis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, axis);
  const bounds = computeUnitBounds(result.units, result.hostId, blendK, axis, plateOffset);
  const materialAt = createUnitsFieldSampler(result.units, blendK);
  const savedField: Field = (x, y, z) =>
    Math.max(materialAt(x, y, z), aboveBuildPlateSdf(x, y, z, axis, plateOffset));
  const gridStepFieldUnits = bounds.longest / PRODUCTION_RESOLUTION;

  const measurement: RealHostMeasurement = {
    report: classifySolidTopology(mesh.triangles, mesh.scaleMmPerUnit, {
      fieldAt: savedField,
      sourceGridStepFieldUnits: gridStepFieldUnits,
    }),
    gridStepFieldUnits,
    scaleMmPerUnit: mesh.scaleMmPerUnit,
  };
  realCache.set(hostId, measurement);
  return measurement;
}

/** shells / solid / cavity / ambiguous, as measured on 2026-07-27. */
const REAL_COUNTS: Record<HostFixtureId, [number, number, number, number]> = {
  box: [10, 1, 7, 2],
  sphere: [3, 1, 2, 0],
  waisted: [5, 1, 4, 0],
};
/** agree / inconclusive / contradict / field-inconsistent, as measured on 2026-07-27. */
const REAL_FIELD_COUNTS: Record<HostFixtureId, [number, number, number, number]> = {
  box: [4, 4, 0, 2],
  sphere: [1, 2, 0, 0],
  waisted: [2, 3, 0, 0],
};

test("C1-35: the three real hosts' shell counts at resolution 64, as measured", () => {
  for (const hostId of REAL_HOSTS) {
    const { report } = realHost(hostId);
    assert.deepEqual(counts(report), REAL_COUNTS[hostId], `${hostId}: ${solidTopologySummary(report)}`);
    assert.deepEqual(fieldCounts(report), REAL_FIELD_COUNTS[hostId], `${hostId}: ${solidTopologySummary(report)}`);
    assert.equal(
      report.solidComponentCount + report.closedCavityCount + report.ambiguousShellCount,
      report.shellCount,
      hostId,
    );
    // Containment resolved every shell on all three hosts; only the FIELD
    // withheld or refused anything.
    assert.equal(report.containmentResolved, true, hostId);
    assert.equal(report.fieldFullyConfirmed, false, `${hostId}: no host had every shell confirmed`);
  }
});

test("C1-36: every real host is ONE solid piece — the shell count is not the piece count", () => {
  for (const hostId of REAL_HOSTS) {
    const { report } = realHost(hostId);
    assert.equal(report.solidComponentCount, 1, hostId);
    assert.ok(report.shellCount > 1, hostId);
    const outer = report.shells.filter((s) => s.kind === "outer-boundary");
    assert.equal(outer.length, 1, hostId);
    assert.equal(outer[0].containmentDepth, 0, hostId);
    assert.equal(outer[0].fieldCheck, "agrees", `${hostId}: the outer boundary itself is field-confirmed`);
  }
});

test("C1-37: box shell #3 — the shell the audit flagged — resolves to field-inconsistent-shell, and stays ambiguous", () => {
  const { report } = realHost("box");
  const shell = report.shells[3];
  assert.equal(shell.triangleCount, 48);
  // It is a clean closed surface: the surface is not what is wrong with it.
  assert.equal(shell.closed, true);
  assert.equal(shell.manifold, true);
  assert.equal(shell.windingConsistent, true);
  assert.deepEqual(shell.crossesShells, []);
  assert.equal(shell.agreeingRepresentatives, 3);
  // All three local probe triangles read the SAME sign on both sides at their
  // nearest informative distance, outside the measured band.
  assert.equal(shell.fieldCheck, "field-inconsistent-shell");
  assert.deepEqual(shell.fieldProbeTally, { agree: 0, contradict: 0, sameSign: 3, inconclusive: 0 });
  assert.equal(shell.kind, "ambiguous");
  assert.equal(shell.containmentDepth, null);
  assert.equal(shell.fieldConfirmed, false);
  // The deep mirror says the same thing here, and both of its readings are
  // confidently POSITIVE — void on both sides.
  assert.equal(shell.deepMirrorFieldCheck, "field-inconsistent-shell");
  assert.ok(shell.fieldInside! > shell.fieldBand!.decision, `${shell.fieldInside}`);
  assert.ok(shell.fieldOutside! > shell.fieldBand!.decision, `${shell.fieldOutside}`);
  // The measured band, all four numbers.
  const band = shell.fieldBand!;
  assert.ok(Math.abs(band.p50 / 1.0339e-3 - 1) < 1e-3, `p50 ${band.p50}`);
  assert.ok(Math.abs(band.p90 / 3.4536e-3 - 1) < 1e-3, `p90 ${band.p90}`);
  assert.ok(Math.abs(band.p99 / 3.9726e-3 - 1) < 1e-3, `p99 ${band.p99}`);
  assert.ok(Math.abs(band.max / 3.9726e-3 - 1) < 1e-3, `max ${band.max}`);
  assert.equal(band.decision, band.p90);
});

test("C1-38: sphere shell #1 — the other flagged shell — is INCONCLUSIVE: kind from containment parity alone, not field-confirmed", () => {
  const { report } = realHost("sphere");
  const shell = report.shells[1];
  assert.equal(shell.triangleCount, 24);
  assert.equal(shell.closed, true);
  assert.equal(shell.manifold, true);
  assert.equal(shell.windingConsistent, true);
  assert.equal(shell.agreeingRepresentatives, 3);
  // The local probe found one agreeing triangle and two same-sign ones, which
  // is below the "several triangles" threshold for a confirmation and above
  // nothing at all — so no verdict is claimed.
  assert.equal(shell.fieldCheck, "inconclusive");
  assert.deepEqual(shell.fieldProbeTally, { agree: 1, contradict: 0, sameSign: 2, inconclusive: 0 });
  assert.equal(shell.fieldConfirmed, false);
  assert.equal(shell.fieldAgreesWithParity, null);
  // Its KIND still stands, from containment parity alone, and that is stated.
  assert.equal(shell.kind, "cavity-wall");
  assert.equal(shell.containmentDepth, 1);
  assert.equal(shell.parentShell, 0);
  assert.deepEqual(shell.ambiguousReasons, []);
  assert.ok(shell.fieldNotes.some((n) => n.includes("包含parityのみ")), JSON.stringify(shell.fieldNotes));
  // The deep pair could not conclude anything either: its INSIDE reading falls
  // inside the measured band, so only one of the two sides is confident and the
  // pair carries no boundary. (Its outside reading is confidently positive —
  // which, on a cavity wall, is what a mirror that has crossed the wall looks
  // like as well as what a correct reading looks like. Undecidable from the
  // deep pair alone; that is the point.)
  assert.equal(shell.deepMirrorFieldCheck, "inconclusive");
  const band = shell.fieldBand!;
  assert.ok(Math.abs(shell.fieldInside!) < band.decision, `${shell.fieldInside} vs ${band.decision}`);
  assert.ok(shell.fieldOutside! > band.decision, `${shell.fieldOutside} vs ${band.decision}`);
  assert.ok(Math.abs(band.p50 / 9.7227e-4 - 1) < 1e-3, `p50 ${band.p50}`);
  assert.ok(Math.abs(band.p90 / 4.8555e-3 - 1) < 1e-3, `p90 ${band.p90}`);
  assert.ok(Math.abs(band.p99 / 5.6511e-3 - 1) < 1e-3, `p99 ${band.p99}`);
  assert.ok(Math.abs(band.max / 5.6511e-3 - 1) < 1e-3, `max ${band.max}`);
});

test("C1-39: on the real hosts the probe distance really is the mesh's own grid step, converted through scaleMmPerUnit", () => {
  for (const hostId of REAL_HOSTS) {
    const { report, gridStepFieldUnits, scaleMmPerUnit } = realHost(hostId);
    assert.ok(gridStepFieldUnits > 0 && Number.isFinite(gridStepFieldUnits), hostId);
    assert.notEqual(scaleMmPerUnit, 1, `${hostId}: the mm/field conversion is exercised, not a no-op`);
    for (const shell of report.shells) {
      assert.ok(shell.fieldProbeTriangles.length >= 3, `${hostId} shell ${shell.index}`);
      for (const probe of shell.fieldProbeTriangles) {
        for (const s of probe.samples) {
          assert.ok(
            Math.abs(s.distanceFieldUnits - s.gridStepMultiple * gridStepFieldUnits) < 1e-12,
            `${hostId}: probe distance must be a multiple of the supplied grid step`,
          );
          assert.ok(
            Math.abs(s.distanceMm - s.distanceFieldUnits * scaleMmPerUnit) < 1e-9,
            `${hostId}: mm distance must be the field distance times the mesh's own scale`,
          );
        }
      }
    }
  }
});

test("C1-40: no real host produced a CONTRADICTION — every ambiguous real shell is ambiguous for a stated reason", () => {
  for (const hostId of REAL_HOSTS) {
    const { report } = realHost(hostId);
    assert.equal(report.fieldContradictionCount, 0, hostId);
    for (const shell of report.shells) {
      if (shell.kind !== "ambiguous") {
        assert.deepEqual(shell.ambiguousReasons, [], `${hostId} shell ${shell.index}`);
        continue;
      }
      assert.ok(shell.ambiguousReasons.length > 0, `${hostId} shell ${shell.index} must say why`);
      assert.equal(shell.fieldCheck, "field-inconsistent-shell", `${hostId} shell ${shell.index}`);
    }
    // Box has the two refused shells, so its gate is closed; the other two hosts
    // have nothing arguing against theirs — but also nothing confirming them.
    assert.equal(report.safeForGate, hostId !== "box", hostId);
    assert.equal(report.safeToOrient, hostId !== "box", hostId);
  }
});

test("C1-41: every real shell's field verdict is consistent with its own probe tally and band", () => {
  for (const hostId of REAL_HOSTS) {
    const { report } = realHost(hostId);
    for (const shell of report.shells) {
      const t = shell.fieldProbeTally;
      const label = `${hostId} shell ${shell.index}`;
      assert.equal(t.agree + t.contradict + t.sameSign + t.inconclusive, shell.fieldProbeTriangles.length, label);
      if (shell.fieldCheck === "agrees") assert.ok(t.agree >= 2 && t.contradict === 0, label);
      if (shell.fieldCheck === "contradicts") assert.ok(t.contradict > 0, label);
      if (shell.fieldCheck === "field-inconsistent-shell") assert.ok(t.agree === 0 && t.sameSign >= 2, label);
      const b = shell.fieldBand!;
      assert.ok(b.p50 <= b.p90 && b.p90 <= b.p99 && b.p99 <= b.max, `${label}: ${JSON.stringify(b)}`);
      assert.equal(b.decision, Math.max(b.p90, Number.EPSILON), label);
    }
  }
});

console.log(`\n${passed} passed`);

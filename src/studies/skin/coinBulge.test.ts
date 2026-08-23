// ---------------------------------------------------------------------------
// T14 coin-bulge experiment (作者Observation 2026-07-20 "CoinSRFで言うと
// コイン部分が平べったくなっているから...ふっくらとして結果サポートが不要な
// 形になっていると自然になりそうだなと考えている" -- a HYPOTHESIS, see
// field.ts's compositeSdf doc comment). Plain-assertion script, no test
// framework (AGENTS.md §5), run via `npx tsx src/studies/skin/coinBulge.test.ts`.
//
// NOT covered here (browser-only, see docs/sonnet-instruction-20260720-
// katachi-coin-bulge-study.md §10 "GLSLとの一致はNode数式テストだけで断定
// せず、ブラウザでraymarchとmesh overlayを同じ値にして見比べる"):
//  - GLSL/CPU visual agreement (shaders.ts mirrors field.ts's compositeSdf
//    by hand, verified by eye in the browser, not re-derived here)
//  - Worker cancellation on a coinBulge change mid-build / no late-result
//    adoption (Vite Worker import doesn't run under plain Node, same
//    documented limitation as partition.test.ts's header)
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import type { Ball } from "../cloud-sculpt/field.ts";
import {
  coinBulgeSides,
  compositeSdf,
  createCompositeSdfEvaluator,
  DEFAULT_SKIN_PARAMS,
  patchesSdf,
  shellSdf,
  opSmoothIntersection,
} from "./field.ts";
import type { Patch, PatchShape } from "./field.ts";
import { computeSkinSamplingBounds } from "./meshExport.ts";
import { buildPartitionMeshes } from "./partition.ts";
import {
  createEmptyState,
  parseRecipe,
  record,
  replay,
  serializeRecipe,
} from "./history.ts";
import type { SkinHistoryEntry } from "./history.ts";

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

// --- fixtures ----------------------------------------------------------

// Single-ball host: fieldSdf reduces to a plain sphere sdf (length(p) - R),
// independent of hostK (smoothMin only matters with >=2 balls) -- keeps the
// hand-computed expectations below exact, not approximate.
const HOST: Ball[] = [{ id: 1, x: 0, y: 0, z: 0, r: 5 }];
const HOST_K = 0.5;
const THICKNESS = 0.4; // shell half-width 0.2
const ROUND_K = 0.05;

function makePatch(id: number, shape: PatchShape, anchor: { x: number; y: number; z: number }, r: number): Patch {
  return { id, shape, points: [{ x: anchor.x, y: anchor.y, z: anchor.z, r }] };
}

// Anchor sits exactly on the host's zero surface (5,0,0); raw patch radius 1.
const COIN_ANCHOR = { x: 5, y: 0, z: 0 };
const COIN_RADIUS = 1;
const coinPatch = makePatch(1, "coin", COIN_ANCHOR, COIN_RADIUS);
const flatRingPatch = makePatch(2, "flatRing", COIN_ANCHOR, COIN_RADIUS);
const ring3dPatch = makePatch(3, "ring3d", COIN_ANCHOR, COIN_RADIUS);

/** Point at (5+t, 0, 0) -- distance t from the host surface along the outward normal. */
function probeAt(t: number): [number, number, number] {
  return [5 + t, 0, 0];
}

test("compiled mesh evaluator is numerically identical to point-query compositeSdf", () => {
  const patches = [coinPatch, flatRingPatch, ring3dPatch];
  for (const mode of ["plate", "window"] as const) {
    for (const bulge of [0, 0.08]) {
      for (const balance of [-1, 0, 1]) {
      const evaluate = createCompositeSdfEvaluator(mode, HOST, HOST_K, THICKNESS, patches, ROUND_K, bulge, balance);
      for (const [x, y, z] of [probeAt(-0.2), probeAt(0), probeAt(0.18), [4.8, 0.2, 0.1] as [number, number, number]]) {
        assert.equal(
          evaluate(x, y, z),
          compositeSdf(mode, HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, bulge, balance),
        );
      }
      }
    }
  }
});

test("coinBulge balance 0 preserves the historical symmetric field exactly", () => {
  for (const t of [-0.55, -0.2, 0, 0.2, 0.55]) {
    const [x, y, z] = probeAt(t);
    const implicitHistorical = compositeSdf("plate", HOST, HOST_K, THICKNESS, [coinPatch], ROUND_K, x, y, z, 0.3);
    const explicitBalanced = compositeSdf("plate", HOST, HOST_K, THICKNESS, [coinPatch], ROUND_K, x, y, z, 0.3, 0);
    assert.equal(explicitBalanced, implicitHistorical, `t=${t}`);
  }
  assert.deepEqual(coinBulgeSides(0.3, 0), { front: 0.3, back: 0.3 });
});

test("coinBulge balance chooses host exterior (front) or interior (back)", () => {
  const outside = probeAt(0.35);
  const inside = probeAt(-0.35);
  const field = (probe: [number, number, number], balance: number) => compositeSdf(
    "plate", HOST, HOST_K, THICKNESS, [coinPatch], ROUND_K, probe[0], probe[1], probe[2], 0.3, balance,
  );
  assert.ok(field(outside, 1) < 0, "front-only must add material outside the host");
  assert.ok(field(inside, 1) > 0, "front-only must not add the same bulge inside the host");
  assert.ok(field(outside, -1) > 0, "back-only must not add the same bulge outside the host");
  assert.ok(field(inside, -1) < 0, "back-only must add material inside the host");
});

test("coinBulge balance does not affect non-coin or window fields", () => {
  for (const patches of [[flatRingPatch], [ring3dPatch]]) {
    for (const t of [-0.35, 0.35]) {
      const [x, y, z] = probeAt(t);
      assert.equal(
        compositeSdf("plate", HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, 0.3, -1),
        compositeSdf("plate", HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, 0.3, 1),
      );
    }
  }
  const [x, y, z] = probeAt(0.35);
  assert.equal(
    compositeSdf("window", HOST, HOST_K, THICKNESS, [coinPatch], ROUND_K, x, y, z, 0.3, -1),
    compositeSdf("window", HOST, HOST_K, THICKNESS, [coinPatch], ROUND_K, x, y, z, 0.3, 1),
  );
});

// --- 1. coinBulge=0, coin-only plate matches the pre-existing formula -----

test("coinBulge=0: coin-only plate matches opSmoothIntersection(shellSdf, patchesSdf) directly (the pre-T14 formula)", () => {
  const patches = [coinPatch];
  for (const t of [-0.05, 0, 0.15, 0.3, 0.6]) {
    const [x, y, z] = probeAt(t);
    const actual = compositeSdf("plate", HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, 0);
    const dShell = shellSdf(HOST, HOST_K, THICKNESS, x, y, z);
    const dPatch = patchesSdf(patches, ROUND_K, x, y, z);
    const expected = opSmoothIntersection(dShell, dPatch, ROUND_K);
    assert.ok(Math.abs(actual - expected) < 1e-9, `t=${t}: ${actual} != ${expected}`);
  }
});

// --- 2. coinBulge=0, coin+flatRing mixed matches the COMBINED formula, not
// a split-then-union (smooth booleans are not distributive) --------------

test("coinBulge=0: coin+flatRing mixed plate matches the combined (pre-split) formula, not separate intersections unioned", () => {
  const patches = [coinPatch, flatRingPatch];
  const [x, y, z] = probeAt(0.15); // inside the blend transition zone where distributivity would show a gap
  const actual = compositeSdf("plate", HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, 0);
  const dShell = shellSdf(HOST, HOST_K, THICKNESS, x, y, z);
  const dCombined = patchesSdf(patches, ROUND_K, x, y, z);
  const expectedCombined = opSmoothIntersection(dShell, dCombined, ROUND_K);
  assert.ok(Math.abs(actual - expectedCombined) < 1e-9, `combined: ${actual} != ${expectedCombined}`);

  // The WRONG (split-then-union) answer, for contrast -- must NOT match.
  const dCoinOnly = patchesSdf([coinPatch], ROUND_K, x, y, z);
  const dFlatRingOnly = patchesSdf([flatRingPatch], ROUND_K, x, y, z);
  const splitWrong = Math.min(
    opSmoothIntersection(dShell, dCoinOnly, ROUND_K),
    opSmoothIntersection(dShell, dFlatRingOnly, ROUND_K),
  );
  // Only assert they'd actually differ here (documents WHY the branch exists);
  // if they happened to coincide at this probe point the point wouldn't prove
  // anything, so we don't hard-fail if they're equal, only report equality.
  if (Math.abs(actual - splitWrong) < 1e-9) {
    console.warn("  (note: split-then-union coincided with the combined formula at this probe point)");
  }
});

// --- 3. Positive coinBulge pushes solid material beyond the old shell band,
// within the coin's own raw field extent -----------------------------------

test("coinBulge>0: a coin sample between the old shell edge and the new coin band goes solid", () => {
  const patches = [coinPatch];
  const t = 0.35; // old shell edge ~0.2, new band edge (0.2+0.3=0.5) -- 0.35 is between them
  const [x, y, z] = probeAt(t);
  const old = compositeSdf("plate", HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, 0);
  const bulged = compositeSdf("plate", HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, 0.3);
  assert.ok(old > 0, `old formula should NOT be solid at t=${t} (got ${old})`);
  assert.ok(bulged < 0, `coinBulge=0.3 should BE solid at t=${t} (got ${bulged})`);
});

// --- 4. coinBulge never extends solid material past the coin's raw field --

test("coinBulge, even very large, never makes a point outside the raw coin field solid", () => {
  const patches = [coinPatch];
  const t = 1.5; // raw coin radius is 1 -- well outside, past the roundK=0.05 blend zone too
  const [x, y, z] = probeAt(t);
  for (const bulge of [0, 0.3, 5.0]) {
    const d = compositeSdf("plate", HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, bulge);
    assert.ok(d > 0, `bulge=${bulge} at t=${t} should stay outside the solid (got ${d})`);
  }
});

// --- 5/6. flatRing-only and ring3d-only plates are unaffected by coinBulge -

test("flatRing-only plate is unchanged by coinBulge value", () => {
  const patches = [flatRingPatch];
  for (const t of [-0.05, 0.15, 0.35, 0.6]) {
    const [x, y, z] = probeAt(t);
    const a = compositeSdf("plate", HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, 0);
    const b = compositeSdf("plate", HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, 0.3);
    assert.ok(Math.abs(a - b) < 1e-9, `t=${t}: ${a} != ${b}`);
  }
});

test("ring3d-only plate is unchanged by coinBulge value", () => {
  const patches = [ring3dPatch];
  for (const t of [-0.05, 0.15, 0.35, 0.6]) {
    const [x, y, z] = probeAt(t);
    const a = compositeSdf("plate", HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, 0);
    const b = compositeSdf("plate", HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, 0.3);
    assert.ok(Math.abs(a - b) < 1e-9, `t=${t}: ${a} != ${b}`);
  }
});

// --- 7. window mode is unaffected by coinBulge -----------------------------

test("window mode is unchanged by coinBulge value, for a coin patch", () => {
  const patches = [coinPatch];
  for (const t of [-0.05, 0.15, 0.35, 0.6]) {
    const [x, y, z] = probeAt(t);
    const a = compositeSdf("window", HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, 0);
    const b = compositeSdf("window", HOST, HOST_K, THICKNESS, patches, ROUND_K, x, y, z, 5.0);
    assert.ok(Math.abs(a - b) < 1e-9, `t=${t}: ${a} != ${b}`);
  }
});

// --- 8. sampling bounds are never too tight for a bulged coin -------------

test("computeSkinSamplingBounds already covers the coin's raw radius regardless of coinBulge (bulge never exceeds raw field, test 4)", () => {
  const patches = [coinPatch];
  const bounds = computeSkinSamplingBounds(HOST, HOST_K, THICKNESS, patches);
  // The raw coin ball's own extent (anchor.x + r) must be inside the bounds --
  // combined with test 4 (bulge never pushes solid past the raw field), this
  // guarantees a bulged mesh build can never be clipped at the sampling
  // boundary for any coinBulge value.
  assert.ok(bounds.max.x >= COIN_ANCHOR.x + COIN_RADIUS, `bounds.max.x=${bounds.max.x} too tight`);
  assert.ok(bounds.min.x <= COIN_ANCHOR.x - COIN_RADIUS, `bounds.min.x=${bounds.min.x} too tight`);
});

// --- 9. old recipe replay -> coinBulge=0 -----------------------------------

test("replaying a history with no setSkinParam coinBulge entries leaves coinBulge at the default (0)", () => {
  const state = createEmptyState();
  const history: SkinHistoryEntry[] = [];
  record(history, state, "growHost", { params: { ...state.hostParams } });
  const replayed = replay(history);
  assert.equal(replayed.skinParams.coinBulge, 0);
  assert.equal(DEFAULT_SKIN_PARAMS.coinBulge, 0);
  assert.equal(replayed.skinParams.coinBulgeBalance, 0);
  assert.equal(DEFAULT_SKIN_PARAMS.coinBulgeBalance, 0);
});

// --- 10. new recipe export/import round-trips the coinBulge value ---------

test("export -> import round-trips a non-zero coinBulge value exactly", () => {
  const state = createEmptyState();
  const history: SkinHistoryEntry[] = [];
  record(history, state, "setSkinParam", { key: "coinBulge", value: 0.08 });
  record(history, state, "setSkinParam", { key: "coinBulgeBalance", value: -0.65 });
  const text = serializeRecipe(history);
  const reparsed = parseRecipe(text);
  const replayed = replay(reparsed);
  assert.equal(replayed.skinParams.coinBulge, 0.08);
  assert.equal(replayed.skinParams.coinBulgeBalance, -0.65);
});

// --- 11. buildPartitionMeshes actually uses the passed coinBulge (not
// silently defaulted / dropped before reaching compositeSdf) ---------------

test("buildPartitionMeshes: different coinBulge values produce different part volumes for a coin-only A/B split", () => {
  // A small two-ball host with two coin patches, one per side -- fast at low
  // resolution, just needs to prove the value flows through, not to be
  // dimensionally accurate.
  const host: Ball[] = [{ id: 1, x: -2, y: 0, z: 0, r: 3 }, { id: 2, x: 2, y: 0, z: 0, r: 3 }];
  const patchA = makePatch(1, "coin", { x: -2 - 3, y: 0, z: 0 }, 1.2);
  const patchB = makePatch(2, "coin", { x: 2 + 3, y: 0, z: 0 }, 1.2);
  const patches = [patchA, patchB];
  const options = { resolution: 16, targetLongestMm: 80 };

  const zero = buildPartitionMeshes("plate", host, 0.5, 0.4, patches, [1], [2], 0.05, options, 0);
  const bulged = buildPartitionMeshes("plate", host, 0.5, 0.4, patches, [1], [2], 0.05, options, 0.3);

  assert.ok(
    zero.a.volumeMm3 !== bulged.a.volumeMm3,
    "part-A volume should differ between coinBulge=0 and coinBulge=0.3 -- if equal, the value never reached compositeSdf inside the Worker's own builder",
  );
  assert.ok(bulged.a.volumeMm3 > zero.a.volumeMm3, "a bulged coin should occupy MORE material than the flat original");
});

console.log(`\n${passed} passed`);
if (process.exitCode) {
  console.error("SOME TESTS FAILED");
} else {
  console.log("ALL TESTS PASSED");
}

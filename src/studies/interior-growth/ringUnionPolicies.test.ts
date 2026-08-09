// ---------------------------------------------------------------------------
// P24 material-composition policy comparison — tests.
//
// Plain-assertion script run via `npx tsx`, same convention as
// `growth.test.ts` / `skin/partition.test.ts` (AGENTS.md §5「重装備フレーム
// ワーク禁止」— no vitest/jest).
//
// Run: `npm run test:ring-union-policies`
//
// WHAT THIS FILE IS FOR
// The policy MEASUREMENTS (the full 3-host × 4-policy table at resolution 64
// and 96) are far too slow for a test suite; they are produced by running
// `measurePolicy` directly and reported to the lead. What is asserted here is
// everything the measurements would be meaningless without:
//  - the P1 control really does reproduce the audited 27 / 12 / 20;
//  - P3's LOCALITY and ORDER-INDEPENDENCE properties, on hand-made fixtures
//    where the right answer is known by construction — not only on grown
//    candidates, where a passing number could be a coincidence;
//  - the saved-mesh replica this module needs (it may not modify
//    `buildCandidateMesh`) is triangle-identical to the production one;
//  - the module stays unreachable from every production entry point.
//
// No tolerance in this file was widened to accommodate a measured result. The
// locality assertions are exact equality (`===`) on purpose: the construction
// makes them exact, so anything less would be hiding a defect.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname as pathDirname, join as pathJoin, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_GROWTH_PARAMS,
  computeDerivedLateralAllowance,
  findPrinterPreset,
  fitHostToBuildVolume,
  type FabricationEnvelope,
  type GrowthUnit,
  type HostFixtureId,
} from "./field.ts";
import { elementSdf, growNetwork, unitFieldElements, type GrowthResult } from "./growth.ts";
import { buildCandidateMesh } from "./meshExport.ts";
import { buildHardUnionStageMesh, diagnosisBounds, hardUnionSdf, measureComponents } from "./ringFusionDiagnosis.ts";
import {
  DEFAULT_CONTACT_OPTIONS,
  DEFAULT_POLICY_MEASUREMENT_OPTIONS,
  P2_DEFAULT_ADDED_THICKNESS_CAP,
  POLICY_IDS,
  baseHardSdf,
  buildGraphLocalJoints,
  buildPolicy,
  buildPolicyMesh,
  compareFieldForms,
  createBaseHardSampler,
  createGraphLocalFieldExact,
  createGraphLocalFieldIndexed,
  deriveReducedFlatBlend,
  edgeIdOf,
  jointConfinementWeight,
  jointSdf,
  measureEdgeContact,
  measurePolicy,
  policyMeasurementFingerprint,
  policyPlateReference,
  unitHardSdf,
} from "./ringUnionPolicies.ts";

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

// --- shared fixtures ---------------------------------------------------------

/** The exact conditions the P2.3 diagnosis and this comparison are both stated at: A1 mini / layer 0.2mm / 30° / seed from DEFAULT_GROWTH_PARAMS / coverage target 0.25. Read from code, never restated as literals. */
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
  return { preset, envelope, fit, params: { ...DEFAULT_GROWTH_PARAMS, targetSurfaceCoverage: 0.25 } };
}

const HOSTS: HostFixtureId[] = ["box", "sphere", "waisted"];
/** The audited P2.3 control: the `blendK -> 0` hard union's component count at resolution 64, per host. */
const HARD_UNION_CONTROL: Record<HostFixtureId, number> = { box: 27, sphere: 12, waisted: 20 };
const PRODUCTION_RESOLUTION = 64;

const grownCache = new Map<HostFixtureId, GrowthResult>();
function grown(hostId: HostFixtureId): GrowthResult {
  let r = grownCache.get(hostId);
  if (!r) {
    const { envelope, fit, params } = conditions(hostId);
    r = growNetwork(hostId, envelope, params, "ring-constrained", fit.scaleMmPerUnit);
    grownCache.set(hostId, r);
  }
  return r;
}

/** A deliberately small grown candidate, for the tests that only need "a real candidate" and would otherwise pay for 300 units. */
let smallCandidate: GrowthResult | null = null;
function small(): GrowthResult {
  if (!smallCandidate) {
    const { envelope, fit } = conditions("box");
    smallCandidate = growNetwork(
      "box",
      envelope,
      { ...DEFAULT_GROWTH_PARAMS, targetSurfaceCoverage: 0.03 },
      "ring-constrained",
      fit.scaleMmPerUnit,
    );
  }
  return smallCandidate;
}

// --- hand-made fixtures -----------------------------------------------------

/**
 * A one-sphere "coin" unit at a chosen centre and radius. `fieldElementsOf`
 * turns a coin's points into raw sphere elements, so this unit's material is
 * exactly one sphere and every locality assertion below has an answer that can
 * be written down rather than measured.
 */
function sphereUnit(id: number, parentId: number | null, x: number, y: number, z: number, r: number): GrowthUnit {
  return {
    id,
    kind: "coin",
    points: [{ x, y, z, r }],
    parentId,
    generation: parentId === null ? 0 : 1,
    supportContact: parentId === null ? "build-plate" : "parent",
    role: parentId === null ? "root" : "trunk",
  } as GrowthUnit;
}

/** Deterministic order-shuffle (no RNG): a fixed permutation by odd/even split then reverse. */
function shuffled<T>(items: T[]): T[] {
  const odd = items.filter((_, i) => i % 2 === 1);
  const even = items.filter((_, i) => i % 2 === 0);
  return [...odd.reverse(), ...even];
}

// ===========================================================================
// 1. The P1 control
// ===========================================================================

test("P24-1: P1 (hard min over all elements) reproduces the audited 27 / 12 / 20 control at resolution 64 — INDEXED form", () => {
  for (const hostId of HOSTS) {
    const result = grown(hostId);
    const blendK = result.params.unitRadius * 0.3;
    const policy = buildPolicy(result.units, "P1-hard-union", { productionBlendK: blendK });
    const mesh = buildPolicyMesh(result, policy.indexed, PRODUCTION_RESOLUTION, blendK, { postClip: true, orient: false });
    const report = measureComponents(mesh.triangles, mesh.scaleMmPerUnit, policyPlateReference(result), result.envelope.layerHeightMm);
    assert.equal(
      report.componentCount,
      HARD_UNION_CONTROL[hostId],
      `${hostId}: hard union must reproduce the audited control ${HARD_UNION_CONTROL[hostId]}, got ${report.componentCount}`,
    );
  }
});

test("P24-2: P1's EXACT form gives the same control, and agrees with the audited instrument `buildHardUnionStageMesh` on sphere", () => {
  for (const hostId of HOSTS) {
    const result = grown(hostId);
    const blendK = result.params.unitRadius * 0.3;
    const policy = buildPolicy(result.units, "P1-hard-union", { productionBlendK: blendK });
    const mesh = buildPolicyMesh(result, policy.exact, PRODUCTION_RESOLUTION, blendK, { postClip: true, orient: false });
    const report = measureComponents(mesh.triangles, mesh.scaleMmPerUnit, policyPlateReference(result), result.envelope.layerHeightMm);
    assert.equal(report.componentCount, HARD_UNION_CONTROL[hostId], `${hostId}: exact hard union component count`);
  }
  // The audited control was produced by `buildHardUnionStageMesh`, which is
  // `unitsPointsSdf` at k = 1e-9 rather than a literal `Math.min`. Cross-checked
  // on one host rather than assumed identical.
  const result = grown("sphere");
  const blendK = result.params.unitRadius * 0.3;
  const audited = buildHardUnionStageMesh(result, PRODUCTION_RESOLUTION, blendK, true);
  const auditedReport = measureComponents(audited.triangles, audited.scaleMmPerUnit, policyPlateReference(result), result.envelope.layerHeightMm);
  assert.equal(auditedReport.componentCount, HARD_UNION_CONTROL.sphere, "sphere: the audited instrument's own count");
});

test("P24-3: `baseHardSdf` and the audited `hardUnionSdf` agree to within the 1e-9 smooth-min's own bound", () => {
  const result = small();
  const bound = 1e-9 / 4 + 1e-12; // smoothMin(a,b,k) >= min(a,b) - k/4, plus float slack
  let worst = 0;
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      for (let k = 0; k < 12; k++) {
        const x = -1 + (2 * i) / 11;
        const y = -1 + (2 * j) / 11;
        const z = -1 + (2 * k) / 11;
        const a = baseHardSdf(result.units, x, y, z);
        const b = hardUnionSdf(result.units, x, y, z);
        // The smooth-min form can only be BELOW the hard min, never above it.
        assert.ok(b <= a + 1e-12, `hardUnionSdf above the true hard min at (${x},${y},${z}): ${b} > ${a}`);
        worst = Math.max(worst, a - b);
      }
    }
  }
  assert.ok(worst <= bound, `worst |baseHardSdf - hardUnionSdf| ${worst} exceeds the 1e-9 blend's own bound ${bound}`);
});

// ===========================================================================
// 2. P3 locality, on hand-made fixtures
// ===========================================================================

test("P24-4: a graph-local joint connects to BOTH parent and child — a gapped pair meshes as one component with the edge, two without it", () => {
  const r = 0.05;
  const gap = 0.01; // < kJoint/2, so a smooth-min at kJoint can bridge it
  const kJoint = 0.04;
  const linked = [sphereUnit(1, null, 0, 0, 0, r), sphereUnit(2, 1, 2 * r + gap, 0, 0, r)];
  const unlinked = [sphereUnit(1, null, 0, 0, 0, r), sphereUnit(2, null, 2 * r + gap, 0, 0, r)];

  const linkedJoints = buildGraphLocalJoints(linked, kJoint);
  assert.equal(linkedJoints.joints.length, 1, "one parent-child edge must give exactly one joint");
  assert.equal(linkedJoints.joints[0].edgeId, edgeIdOf(1, 2));
  assert.equal(buildGraphLocalJoints(unlinked, kJoint).joints.length, 0, "two parentless units must give no joint at all");

  const fieldLinked = createGraphLocalFieldExact(linked, linkedJoints);
  const fieldUnlinked = createGraphLocalFieldExact(unlinked, buildGraphLocalJoints(unlinked, kJoint));

  // The joint bridges: the midpoint between the two surfaces is OUTSIDE both
  // units' hard material and INSIDE the joined field.
  const mid = { x: r + gap / 2, y: 0, z: 0 };
  assert.ok(baseHardSdf(linked, mid.x, mid.y, mid.z) > 0, "test setup check: the midpoint must be outside the hard material");
  assert.ok(fieldLinked(mid.x, mid.y, mid.z) < 0, "the joint must put material at the midpoint between parent and child");
  assert.ok(fieldUnlinked(mid.x, mid.y, mid.z) > 0, "without a graph edge there must be no material at the midpoint");

  // And it connects continuously to both: every point on the axis from inside
  // the parent to inside the child is material.
  for (let i = 0; i <= 40; i++) {
    const x = -r * 0.5 + (i / 40) * (2 * r + gap + r * 0.5 + r * 0.5);
    assert.ok(fieldLinked(x, 0, 0) <= 0, `the joined material must be continuous along the axis; broke at x=${x}`);
  }
});

test("P24-5: outside the contact neighbourhood the P3 field equals the base field EXACTLY (===, not within a tolerance)", () => {
  const kJoint = 0.04;
  const units = [sphereUnit(1, null, 0, 0, 0, 0.05), sphereUnit(2, 1, 0.11, 0, 0, 0.05), sphereUnit(3, 2, 0.11, 0.11, 0, 0.05)];
  const jointSet = buildGraphLocalJoints(units, kJoint);
  assert.equal(jointSet.joints.length, 2);
  const exact = createGraphLocalFieldExact(units, jointSet);
  const indexed = createGraphLocalFieldIndexed(units, jointSet, kJoint);
  let outsideChecked = 0;
  let insideChecked = 0;
  for (let i = 0; i <= 30; i++) {
    for (let j = 0; j <= 30; j++) {
      for (let k = 0; k <= 30; k++) {
        const x = -0.4 + (i / 30) * 1.0;
        const y = -0.4 + (j / 30) * 1.0;
        const z = -0.4 + (k / 30) * 1.0;
        const base = baseHardSdf(units, x, y, z);
        const outsideEveryJoint = jointSet.joints.every((jt) => {
          const c = jt.contact.contactCentre;
          return Math.hypot(x - c.x, y - c.y, z - c.z) >= jt.rOuterFieldUnits;
        });
        if (outsideEveryJoint) {
          assert.equal(exact(x, y, z), base, `outside every neighbourhood the exact field must BE the base field at (${x},${y},${z})`);
          outsideChecked++;
        } else {
          assert.ok(exact(x, y, z) <= base, "inside a neighbourhood a joint may only ADD material");
          insideChecked++;
        }
        // the indexed form must make the same statement
        if (outsideEveryJoint) assert.equal(indexed(x, y, z), createBaseHardSampler(units, kJoint)(x, y, z));
      }
    }
  }
  assert.ok(outsideChecked > 1000, `test setup check: expected many samples outside the neighbourhoods, got ${outsideChecked}`);
  assert.ok(insideChecked > 0, `test setup check: expected some samples inside a neighbourhood, got ${insideChecked}`);
});

test("P24-6: units that are NOT graph neighbours never fuse, even when they are closer than a graph edge's pair", () => {
  const r = 0.05;
  // 1 -> 2 is a graph edge with a 0.01 gap. 3 is parentless and sits 0.008 from
  // 2 — CLOSER than the edge's own pair, so a distance-based rule would fuse it.
  const units = [
    sphereUnit(1, null, 0, 0, 0, r),
    sphereUnit(2, 1, 2 * r + 0.01, 0, 0, r),
    sphereUnit(3, null, 2 * r + 0.01, 2 * r + 0.008, 0, r),
  ];
  const kJoint = 0.04;
  const jointSet = buildGraphLocalJoints(units, kJoint);
  assert.equal(jointSet.joints.length, 1, "only the 1->2 edge may produce a joint");
  assert.equal(jointSet.joints[0].edgeId, edgeIdOf(1, 2));
  const field = createGraphLocalFieldExact(units, jointSet);
  // The 2/3 midpoint stays void.
  const mid = { x: 2 * r + 0.01, y: r + (2 * r + 0.008 - r - r) / 2 + r, z: 0 };
  const between = { x: units[1].points[0].x, y: (units[1].points[0].y + units[2].points[0].y) / 2, z: 0 };
  assert.ok(baseHardSdf(units, between.x, between.y, between.z) > 0, "test setup check: 2 and 3 must not already overlap");
  assert.equal(
    field(between.x, between.y, between.z),
    baseHardSdf(units, between.x, between.y, between.z),
    "no smooth material may appear between two units with no graph edge",
  );
  void mid;
});

test("P24-7: the confinement weight is exactly 1 at/inside rInner and exactly 0 at/outside rOuter, and monotone between", () => {
  const rInner = 0.08;
  const rOuter = 0.12;
  assert.equal(jointConfinementWeight(0, rInner, rOuter), 1);
  assert.equal(jointConfinementWeight(rInner, rInner, rOuter), 1);
  assert.equal(jointConfinementWeight(rOuter, rInner, rOuter), 0);
  assert.equal(jointConfinementWeight(rOuter * 10, rInner, rOuter), 0);
  let previous = 1;
  for (let i = 0; i <= 100; i++) {
    const d = rInner + ((rOuter - rInner) * i) / 100;
    const w = jointConfinementWeight(d, rInner, rOuter);
    assert.ok(w <= previous + 1e-15, `weight must be non-increasing; rose at d=${d}`);
    assert.ok(w >= 0 && w <= 1, `weight out of range at d=${d}: ${w}`);
    previous = w;
  }
});

test("P24-8: a joint can only ADD material — `jointSdf <= min(dParent, dChild)` everywhere, with equality wherever the weight is 0", () => {
  const units = [sphereUnit(1, null, 0, 0, 0, 0.05), sphereUnit(2, 1, 0.11, 0, 0, 0.05)];
  const jointSet = buildGraphLocalJoints(units, 0.04);
  const joint = jointSet.joints[0];
  for (let i = 0; i <= 40; i++) {
    for (let j = 0; j <= 40; j++) {
      const x = -0.3 + (i / 40) * 0.8;
      const y = -0.3 + (j / 40) * 0.8;
      const dp = unitHardSdf(units[0], x, y, 0);
      const dc = unitHardSdf(units[1], x, y, 0);
      const v = jointSdf(joint, x, y, 0, dp, dc);
      assert.ok(v <= Math.min(dp, dc) + 1e-15, `a joint removed material at (${x},${y})`);
      const c = joint.contact.contactCentre;
      if (Math.hypot(x - c.x, y - c.y, 0 - c.z) >= joint.rOuterFieldUnits) {
        assert.equal(v, Math.min(dp, dc), `outside rOuter the joint must be exactly min(dParent, dChild) at (${x},${y})`);
      }
    }
  }
});

test("P24-9: the sampled contact locator finds a two-sphere pair's analytically known gap within its own stated error bound", () => {
  const r1 = 0.05;
  const r2 = 0.03;
  const separation = 0.13;
  const units = [sphereUnit(1, null, 0, 0, 0, r1), sphereUnit(2, 1, separation, 0, 0, r2)];
  const contact = measureEdgeContact(units[0], units[1], DEFAULT_CONTACT_OPTIONS);
  const trueGap = separation - r1 - r2;
  // Sphere elements have zero segment length, so the sampling error bound is 0
  // and the gap is exact — which is exactly what the bound claims.
  assert.equal(contact.samplingErrorBoundFieldUnits, 0);
  assert.ok(Math.abs(contact.sampledMinSignedGapFieldUnits - trueGap) < 1e-12, `gap ${contact.sampledMinSignedGapFieldUnits} vs ${trueGap}`);
  // The neighbourhood centre sits midway between the two SURFACES.
  assert.ok(Math.abs(contact.contactCentre.x - (r1 + trueGap / 2)) < 1e-12, `centre x ${contact.contactCentre.x}`);
  assert.equal(contact.contactTubeRadiusFieldUnits, Math.max(r1, r2));
});

test("P24-10: on a real ring pair the located contact really is a contact — both units' hard material is within the joint's inner radius of the centre", () => {
  const result = small();
  const byId = new Map(result.units.map((u) => [u.id, u]));
  const kJoint = result.params.unitRadius * 0.3;
  const jointSet = buildGraphLocalJoints(result.units, kJoint);
  assert.ok(jointSet.joints.length > 0, "test setup check: the small candidate must have parent-child edges");
  for (const j of jointSet.joints) {
    const parent = byId.get(j.parentId)!;
    const child = byId.get(j.childId)!;
    const c = j.contact.contactCentre;
    const dp = unitHardSdf(parent, c.x, c.y, c.z);
    const dc = unitHardSdf(child, c.x, c.y, c.z);
    // The centre is midway between the two surfaces, so each unit's own surface
    // is at most |gap|/2 away in either direction.
    const halfGap = Math.abs(j.contact.sampledMinSignedGapFieldUnits) / 2 + j.contact.samplingErrorBoundFieldUnits + 1e-9;
    assert.ok(Math.abs(dp) <= halfGap, `edge ${j.edgeId}: parent surface ${dp} further than ${halfGap} from the contact centre`);
    assert.ok(Math.abs(dc) <= halfGap, `edge ${j.edgeId}: child surface ${dc} further than ${halfGap} from the contact centre`);
    assert.ok(j.rInnerFieldUnits > j.contact.contactTubeRadiusFieldUnits, `edge ${j.edgeId}: rInner must exceed the local tube radius`);
    assert.equal(j.rOuterFieldUnits, j.rInnerFieldUnits + kJoint);
  }
});

// ===========================================================================
// 3. Order independence
// ===========================================================================

test("P24-11: reversing and shuffling the unit/edge enumeration yields an IDENTICAL P3 field and an IDENTICAL mesh", () => {
  const result = small();
  const kJoint = result.params.unitRadius * 0.3;
  const orders: Array<{ label: string; units: GrowthUnit[] }> = [
    { label: "as grown", units: result.units },
    { label: "reversed", units: [...result.units].reverse() },
    { label: "shuffled", units: shuffled(result.units) },
  ];
  const built = orders.map((o) => ({ ...o, joints: buildGraphLocalJoints(o.units, kJoint) }));

  // The joint LIST itself is canonical (sorted by parent id then child id).
  const reference = built[0].joints.joints.map((j) => j.edgeId);
  for (const b of built.slice(1)) {
    assert.deepEqual(b.joints.joints.map((j) => j.edgeId), reference, `${b.label}: joint list must be in canonical id order`);
    for (let i = 0; i < reference.length; i++) {
      assert.equal(b.joints.joints[i].rInnerFieldUnits, built[0].joints.joints[i].rInnerFieldUnits, `${b.label}: rInner must not depend on order`);
      assert.equal(b.joints.joints[i].rOuterFieldUnits, built[0].joints.joints[i].rOuterFieldUnits, `${b.label}: rOuter must not depend on order`);
    }
  }

  // The FIELD is identical, bit-for-bit, in both forms.
  const fields = built.map((b) => ({
    label: b.label,
    exact: createGraphLocalFieldExact(b.units, b.joints),
    indexed: createGraphLocalFieldIndexed(b.units, b.joints, kJoint),
  }));
  for (let i = 0; i <= 20; i++) {
    for (let j = 0; j <= 20; j++) {
      for (let k = 0; k <= 20; k++) {
        const x = -1.1 + (i / 20) * 2.2;
        const y = -1.1 + (j / 20) * 2.2;
        const z = -1.1 + (k / 20) * 2.2;
        for (const f of fields.slice(1)) {
          assert.equal(f.exact(x, y, z), fields[0].exact(x, y, z), `${f.label}: exact field must be identical at (${x},${y},${z})`);
          assert.equal(f.indexed(x, y, z), fields[0].indexed(x, y, z), `${f.label}: indexed field must be identical at (${x},${y},${z})`);
        }
      }
    }
  }

  // And so is the MESH, triangle for triangle.
  const blendK = result.params.unitRadius * 0.3;
  const meshes = built.map((b) =>
    buildPolicyMesh(result, createGraphLocalFieldIndexed(b.units, b.joints, kJoint), 24, blendK, { postClip: true, orient: true }),
  );
  for (let m = 1; m < meshes.length; m++) {
    assert.equal(meshes[m].triangles.length, meshes[0].triangles.length, `${built[m].label}: triangle count must not depend on order`);
    assert.deepEqual(meshes[m].triangles, meshes[0].triangles, `${built[m].label}: the mesh must be identical`);
  }
});

// ===========================================================================
// 4. Exact vs indexed
// ===========================================================================

test("P24-12: P3's exact and indexed forms agree on the zero-crossing SIGN, and on the VALUE near the surface", () => {
  const result = small();
  const blendK = result.params.unitRadius * 0.3;
  const policy = buildPolicy(result.units, "P3-graph-local", { productionBlendK: blendK });
  const bounds = diagnosisBounds(result, blendK);
  const step = bounds.longest / 64;
  const agreement = compareFieldForms(bounds, policy.exact, policy.indexed, 22, step);
  assert.equal(agreement.signDisagreements, 0, `sign disagreements: ${agreement.signDisagreements} (max |exact| there ${agreement.maxAbsExactAtSignDisagreement})`);
  assert.ok(agreement.nearSurfaceCompared > 0, "test setup check: some samples must land near the surface");
  assert.equal(
    agreement.maxAbsDifferenceNearSurface,
    0,
    `near the surface the indexed form must be EXACT, not merely close; worst |Δ| ${agreement.maxAbsDifferenceNearSurface}`,
  );
});

test("P24-13: P1's exact and indexed forms agree on sign everywhere (a hard min has no blend band to disagree in)", () => {
  const result = small();
  const blendK = result.params.unitRadius * 0.3;
  const policy = buildPolicy(result.units, "P1-hard-union", { productionBlendK: blendK });
  const bounds = diagnosisBounds(result, blendK);
  const agreement = compareFieldForms(bounds, policy.exact, policy.indexed, 22, bounds.longest / 64);
  assert.equal(agreement.signDisagreements, 0);
  assert.equal(agreement.maxAbsDifferenceNearSurface, 0);
});

// ===========================================================================
// 5. The saved-mesh replica is the production one
// ===========================================================================

test("P24-14: the module's P0 saved mesh is TRIANGLE-IDENTICAL to `buildCandidateMesh`'s — the replica may not drift from the production composition", () => {
  const result = small();
  const blendK = result.params.unitRadius * 0.3;
  const production = buildCandidateMesh(result, 24, blendK);
  const policy = buildPolicy(result.units, "P0-flat-smooth", { productionBlendK: blendK });
  const replica = buildPolicyMesh(result, policy.indexed, 24, blendK, { postClip: true, orient: true });
  assert.equal(replica.triangles.length, production.triangles.length, "triangle count");
  assert.deepEqual(replica.triangles, production.triangles, "the replica must be the production mesh, not merely similar to it");
  assert.equal(replica.scaleMmPerUnit, production.scaleMmPerUnit);
  assert.deepEqual(replica.plateReference, production.plateReference, "`policyPlateReference` must equal the production plate reference");
  assert.deepEqual(policyPlateReference(result), production.plateReference);
});

// ===========================================================================
// 6. P2's derivation
// ===========================================================================

test("P24-15: P2's blend is DERIVED from the candidate's own thinnest tube, and the derivation is the stated one", () => {
  const result = small();
  const blendK = result.params.unitRadius * 0.3;
  const d = deriveReducedFlatBlend(result.units, blendK, P2_DEFAULT_ADDED_THICKNESS_CAP);
  let minR = Infinity;
  for (const u of result.units) for (const p of u.points) minR = Math.min(minR, p.r);
  assert.equal(d.minNodeRadiusFieldUnits, minR);
  assert.equal(d.blendK, 4 * P2_DEFAULT_ADDED_THICKNESS_CAP * minR);
  assert.equal(d.maxAddedThicknessFieldUnits, d.blendK / 4);
  assert.ok(d.maxAddedThicknessFieldUnits <= P2_DEFAULT_ADDED_THICKNESS_CAP * minR + 1e-15, "the stated cap must actually hold");
  assert.ok(d.blendK < blendK, "P2's blend must be smaller than production's, or it is not a reduced blend");
});

// ===========================================================================
// 7. Determinism
// ===========================================================================

test("P24-16: policy measurement is deterministic for a fixed seed — two runs produce an identical fingerprint", () => {
  const result = small();
  const { preset } = conditions("box");
  const options = {
    ...DEFAULT_POLICY_MEASUREMENT_OPTIONS,
    resolution: 20,
    addedVolumeLattice: 24,
    fieldFormLattice: 10,
    hardOverlapDensities: [12, 16],
    includeCoverage: false,
    buildVolumeMm: preset.buildVolumeMm,
  };
  for (const id of POLICY_IDS) {
    const a = policyMeasurementFingerprint(measurePolicy(result, id, options));
    const b = policyMeasurementFingerprint(measurePolicy(result, id, options));
    assert.equal(a, b, `${id}: two identical runs must produce identical numbers`);
  }
});

test("P24-17: a policy's numbers do not depend on the order the units arrive in", () => {
  const result = small();
  const { preset } = conditions("box");
  const options = {
    ...DEFAULT_POLICY_MEASUREMENT_OPTIONS,
    resolution: 20,
    addedVolumeLattice: 24,
    fieldFormLattice: 10,
    hardOverlapDensities: [12, 16],
    includeCoverage: false,
    buildVolumeMm: preset.buildVolumeMm,
  };
  const reversed: GrowthResult = { ...result, units: [...result.units].reverse() };
  for (const id of ["P1-hard-union", "P3-graph-local"] as const) {
    const a = measurePolicy(result, id, options);
    const b = measurePolicy(reversed, id, options);
    assert.equal(a.savedComponentCount, b.savedComponentCount, `${id}: component count must not depend on unit order`);
    assert.deepEqual(b.savedMesh.triangles, a.savedMesh.triangles, `${id}: the saved mesh must not depend on unit order`);
  }
});

// ===========================================================================
// 8. P3 adds nothing where it must not
// ===========================================================================

test("P24-18: on a real candidate P3 adds no material below the build plate, and removes no hard material anywhere", () => {
  const result = small();
  const { preset } = conditions("box");
  const options = {
    ...DEFAULT_POLICY_MEASUREMENT_OPTIONS,
    resolution: 20,
    addedVolumeLattice: 40,
    fieldFormLattice: 8,
    includeExact: false,
    includeComponentIdentity: false,
    includeBlendOnlyTally: false,
    includeCoverage: false,
    buildVolumeMm: preset.buildVolumeMm,
  };
  const m = measurePolicy(result, "P3-graph-local", options);
  assert.equal(m.addedMaterial.removedCells, 0, "a policy that only adds material must never remove a hard-union cell");
  assert.equal(m.addedMaterial.addedCellsBelowPlate, 0, "P3 must add no material below the build plate plane");
  assert.ok(m.addedMaterial.addedCells > 0, "test setup check: P3 must add SOME material, or the joints are doing nothing");
  assert.equal(m.jointCount, result.units.filter((u) => u.parentId !== null).length, "exactly one joint per parent-child edge");
});

test("P24-19: P3's added material is bounded by kJoint/4 — no point of the P3 field is more than that below the base", () => {
  const result = small();
  const kJoint = result.params.unitRadius * 0.3;
  const policy = buildPolicy(result.units, "P3-graph-local", { productionBlendK: kJoint });
  const bounds = diagnosisBounds(result, kJoint);
  let worst = 0;
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 20; j++) {
      for (let k = 0; k < 20; k++) {
        const x = bounds.min.x + ((i + 0.5) * bounds.size.x) / 20;
        const y = bounds.min.y + ((j + 0.5) * bounds.size.y) / 20;
        const z = bounds.min.z + ((k + 0.5) * bounds.size.z) / 20;
        const base = baseHardSdf(result.units, x, y, z);
        const p3 = policy.exact(x, y, z);
        assert.ok(p3 <= base + 1e-15, `P3 rose above the base at (${x},${y},${z}): ${p3} > ${base}`);
        worst = Math.max(worst, base - p3);
      }
    }
  }
  assert.ok(worst <= kJoint / 4 + 1e-12, `P3 dropped ${worst} below the base, more than kJoint/4 = ${kJoint / 4}`);
});

// ===========================================================================
// 9. Every unit's own material stays a hard union (contract clause 1)
// ===========================================================================

test("P24-20: `unitHardSdf` is the hard min of the unit's own elements and is independent of element order", () => {
  const result = small();
  const unit = result.units.find((u) => u.kind === "ring" && u.points.length > 2) ?? result.units[0];
  const elements = unitFieldElements(unit);
  assert.ok(elements.length > 1, "test setup check: need a multi-element unit");
  for (let i = 0; i < 15; i++) {
    const x = unit.points[0].x + (i - 7) * 0.02;
    const y = unit.points[0].y + (i - 7) * 0.013;
    const z = unit.points[0].z + (i - 7) * 0.007;
    let expected = Infinity;
    for (const e of elements) expected = Math.min(expected, elementSdf(e, x, y, z));
    assert.equal(unitHardSdf(unit, x, y, z), expected);
    let reversedMin = Infinity;
    for (const e of [...elements].reverse()) reversedMin = Math.min(reversedMin, elementSdf(e, x, y, z));
    assert.equal(reversedMin, expected, "a hard min cannot depend on element order");
  }
});


// ===========================================================================
// 10. The diagnosis-only premise
// ===========================================================================

test("P24-21: this module is not reachable from any production entry point", () => {
  // Same crawl as growth.test.ts's P2.3-18, extended to this module. The
  // "changes no production behavior" premise is only true while nothing shipped
  // imports it, so it is CHECKED rather than asserted in a comment.
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
  assert.ok(
    seen.has(pathJoin(repoRoot, "src", "studies", "interior-growth", "meshExport.ts")),
    "the crawler did not reach a file that is certainly production-reachable — fix the crawler before trusting its negative result",
  );
  for (const forbidden of ["ringUnionPolicies.ts", "ringUnionPolicies.test.ts"]) {
    const path = pathJoin(repoRoot, "src", "studies", "interior-growth", forbidden);
    assert.equal(seen.has(path), false, `${forbidden} is reachable from a production entry — this module is no longer diagnosis-only`);
  }
});

console.log(`\n${passed} passed`);

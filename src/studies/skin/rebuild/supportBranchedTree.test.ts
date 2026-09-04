import assert from "node:assert/strict";
import {
  buildBranchedTreeFixture,
  compareBranchedModes,
  compareIndependentBaseline,
  planSupportTrees,
  supportBranchedTreeFingerprint,
  validateSupportTreeAcyclic,
  type BranchedTargetInput,
} from "./supportBranchedTree.ts";
import { canonicalStringify } from "../graphCore.ts";

const fixture = buildBranchedTreeFixture();
const comparison = compareBranchedModes(fixture.targets, fixture.options);

function targetRoute(x: number, height: number, leanToX?: number): BranchedTargetInput["route"] {
  return {
    kind: leanToX === undefined ? "vertical" : "leaning",
    root: { x, y: 0, z: 0 },
    neckStart: { x: leanToX ?? x, y: 0, z: height - 1 },
    target: { x: leanToX ?? x, y: 0, z: height },
    segments: leanToX === undefined
      ? [
        { start: { x, y: 0, z: 0 }, end: { x, y: 0, z: height - 1 }, radius: 0.8 },
        { start: { x, y: 0, z: height - 1 }, end: { x, y: 0, z: height }, radius: 0.4 },
      ]
      : [
        { start: { x, y: 0, z: 0 }, end: { x: leanToX, y: 0, z: height - 1 }, radius: 0.8 },
        { start: { x: leanToX, y: 0, z: height - 1 }, end: { x: leanToX, y: 0, z: height }, radius: 0.4 },
      ],
  };
}

// 1. Near targets but divergent routes -> do not share.
{
  const shared = comparison.shared;
  const together = shared.trees.some(
    (tree) => tree.targetIds.includes("target-d") && tree.targetIds.includes("target-e"),
  );
  assert.equal(together, false, "divergent short/leaning routes must not share one trunk");
  assert.ok(
    shared.independentTargets.includes("target-d") && shared.independentTargets.includes("target-e"),
    "divergent targets keep independent trunks",
  );
  assert.ok(
    shared.rejections.some((r) => r.memberIds.includes("target-d") && r.memberIds.includes("target-e")
      && r.reason.includes("branch angle")),
    "the angle gate must record the rejection",
  );
}

// 2. Overlapping lower corridors -> share.
{
  const tree = comparison.shared.trees.find(
    (t) => t.targetIds.includes("target-a") && t.targetIds.includes("target-b"),
  );
  assert.ok(tree, "overlapping lower corridors must form one shared tree");
  assert.equal(tree?.children.length, 2);
  assert.ok((tree?.junction.z ?? 0) > 0, "junction must sit above the plate");
  assert.ok(
    (comparison.shared.corridorScores.length) >= 1,
    "accepted shares carry corridor scores",
  );
  const score = comparison.shared.corridorScores.find(
    (s) => s.memberIds.includes("target-a") && s.memberIds.includes("target-b"),
  );
  assert.ok(score && score.candidateSharedLengthMm >= 6, "shared length must clear the gate");
}

// 3. Two independent routes interfere -> shared trunk resolves.
assert.equal(
  comparison.independent.metrics.routing.independentRouteConflicts,
  1,
  "fixture independents must contain exactly one conflict",
);
assert.equal(comparison.shared.metrics.routing.resolvedBySharingCount, 1);
assert.equal(comparison.shared.metrics.routing.newConflictsIntroduced, 0);

// 4. BODY between candidate routes -> sharing rejected.
{
  const wallSdf = (x: number, _y: number, _z: number) => Math.abs(x - 60.75) - 0.5;
  const walled = buildBranchedTreeFixture({ bodySdf: wallSdf });
  const result = compareBranchedModes(walled.targets, walled.options);
  const together = result.shared.trees.some(
    (tree) => tree.targetIds.includes("target-a") && tree.targetIds.includes("target-b"),
  );
  assert.equal(together, false, "a BODY wall on the shared trunk must reject sharing");
  assert.ok(
    result.shared.rejections.some((r) => r.reason.includes("BODY")),
    "the BODY gate must record the rejection",
  );
  assert.equal(result.shared.metrics.safety.bodyCollisionCount, 0);
}

// 5. Branch angle exceeds limit -> reject / alternate.
{
  const steep = buildBranchedTreeFixture({ maxBranchAngleFromVerticalDeg: 5 });
  const result = compareBranchedModes(steep.targets, steep.options);
  assert.equal(result.shared.trees.length, 0, "a 5° ceiling must reject every share");
  assert.ok(result.shared.rejections.length > 0);
  // The default 60° guideline accepts the fixture pair instead.
  assert.equal(comparison.shared.trees.length, 1);
  assert.ok(
    (comparison.shared.metrics.routing.maxBranchAngleFromVerticalDeg ?? 999) <= 60,
    "fixture branches stay inside the guideline",
  );
}

// 6. Too many critical targets on one trunk -> split / reject.
{
  const criticalTargets: BranchedTargetInput[] = ["k1", "k2", "k3"].map((id, index) => ({
    id,
    route: targetRoute(60 + index * 1.5, 30),
    critical: true,
  }));
  const capped = buildBranchedTreeFixture({ maxCriticalTargetsPerSharedTrunk: 2 });
  const result = compareBranchedModes(criticalTargets, capped.options);
  for (const tree of result.shared.trees) {
    assert.ok(
      tree.criticalTargetIds.length <= 2,
      `no trunk may concentrate critical targets (got ${tree.criticalTargetIds.length})`,
    );
  }
  const covered = new Set([
    ...result.shared.trees.flatMap((t) => t.targetIds),
    ...result.shared.independentTargets,
  ]);
  assert.deepEqual([...covered].sort(), ["k1", "k2", "k3"], "split keeps every target covered");
  assert.ok(
    result.shared.rejections.some((r) => r.reason.includes("critical")),
    "the critical cap must record a rejection",
  );
}

// 7. Tree has no cycle.
for (const mode of ["shared", "shared-lowdiagonal"] as const) {
  for (const tree of comparison[mode].trees) {
    assert.equal(validateSupportTreeAcyclic(tree), null, `${tree.id} must be a true tree`);
  }
}

// 8. Shared trunk diameter stays at the current support diameter (multiplier 1.0).
{
  assert.equal(fixture.options.sharedTrunkDiameterMultiplier ?? 1.0, 1.0);
  for (const tree of comparison.shared.trees) {
    for (const segment of tree.trunkSegments) {
      assert.equal(segment.radius, 0.8, "shared trunk uses the current support radius");
    }
  }
}

// 9. Bootstrap metric does not worsen unexpectedly.
assert.ok(
  comparison.shared.metrics.bootstrap.meanBootstrapUnbracedLengthMm
    <= comparison.independent.metrics.bootstrap.meanBootstrapUnbracedLengthMm + 1e-9,
  "sharing must not lengthen the mean bootstrap span",
);
assert.ok(
  comparison.shared.metrics.bootstrap.maxBootstrapUnbracedLengthMm
    <= comparison.independent.metrics.bootstrap.maxBootstrapUnbracedLengthMm + 1e-9,
  "sharing must not lengthen the worst bootstrap span",
);

// 10. Unintended support fusion rejected.
{
  const fused: BranchedTargetInput[] = [
    { id: "fuse-solo", route: targetRoute(62.6, 30), critical: false },
    { id: "fuse-a", route: targetRoute(60, 30), critical: false },
    { id: "fuse-b", route: targetRoute(61.5, 30), critical: false },
  ];
  const options = buildBranchedTreeFixture({ maxTargetsPerSharedTrunk: 2 }).options;
  const result = compareBranchedModes(fused, options);
  const together = result.shared.trees.some(
    (tree) => tree.targetIds.includes("fuse-a") && tree.targetIds.includes("fuse-b"),
  );
  assert.equal(together, false, "trunk fusing with the solo route must reject the share");
  assert.ok(
    result.shared.rejections.some((r) => r.reason.includes("fuses")),
    "the fusion gate must record the rejection",
  );
  assert.equal(result.shared.metrics.safety.unintendedFusionCount, 0);
}

// 11. All target provenance preserved (exactly one home per target).
for (const mode of ["independent", "shared", "shared-lowdiagonal"] as const) {
  const result = comparison[mode];
  const homes = new Map<string, number>();
  for (const tree of result.trees) {
    for (const id of tree.targetIds) homes.set(id, (homes.get(id) ?? 0) + 1);
    assert.deepEqual([...tree.sourceRouteIds].sort(), [...tree.targetIds].sort());
    assert.ok(tree.sharedReason.length > 0, "every tree carries its shared reason");
    assert.equal(
      tree.failureDomain.maxTargetsLostOnRootFailure,
      tree.targetIds.length,
      "failure domain states the root-failure loss honestly",
    );
  }
  for (const id of result.independentTargets) homes.set(id, (homes.get(id) ?? 0) + 1);
  assert.deepEqual(
    [...homes.entries()].sort(),
    fixture.targets.map((t) => [t.id, 1]).sort(),
    `${mode}: every target has exactly one home`,
  );
  const payload = canonicalStringify(result);
  assert.ok(!payload.includes("printApproval"), "experimental evidence carries no print approval");
  assert.ok(!payload.includes(".fkei"), "experimental evidence never touches FKEI identity");
}

// 12. Same input -> deterministic same output.
{
  const again = compareBranchedModes(fixture.targets, fixture.options);
  assert.equal(supportBranchedTreeFingerprint(comparison), supportBranchedTreeFingerprint(again));
  const planned = planSupportTrees(fixture.targets, fixture.options);
  const plannedAgain = planSupportTrees(fixture.targets, fixture.options);
  assert.equal(canonicalStringify(planned), canonicalStringify(plannedAgain));
}

// 13. Independent mode -> current experimental baseline unchanged.
{
  const baseline = compareIndependentBaseline(fixture.targets, fixture.options);
  assert.equal(canonicalStringify(comparison.independent), canonicalStringify(baseline));
  assert.equal(comparison.independent.metrics.material.materialChangeVsCurrent, 0);
  assert.deepEqual(comparison.independent.trees, []);
}

// 14. Shared + Low Diagonal composes footing metrics without mutating Print #2.
{
  const low = comparison["shared-lowdiagonal"];
  assert.equal(low.version, "support-branched-tree-v0-experimental");
  assert.ok(Array.isArray(low.lowBraces), "composed braces ride along as evidence");
  assert.ok(
    low.metrics.bootstrap.meanBootstrapUnbracedLengthMm
      <= comparison.shared.metrics.bootstrap.meanBootstrapUnbracedLengthMm + 1e-9,
    "composed braces must never worsen the shared bootstrap mean",
  );
  // Print #2 shape identity guard: composed output references only the
  // experimental input target ids — no production route, BODY, or FKEI id.
  const inputIds = new Set(fixture.targets.map((t) => t.id));
  for (const tree of low.trees) {
    for (const id of [...tree.targetIds, ...tree.sourceRouteIds]) {
      assert.ok(inputIds.has(id), `composed tree references only experimental inputs (got ${id})`);
    }
  }
}

console.log("support branched tree v0: focused checks passed");

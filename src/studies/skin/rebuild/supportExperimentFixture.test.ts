import assert from "node:assert/strict";
import {
  buildTriangleSoupSdf,
  captureSupportExperimentFixture,
  compareFixtureModes,
  createSupportExperimentRegistry,
  detectOrganicGeneralizationWarnings,
  parseSupportExperimentFixture,
  serializeSupportExperimentFixture,
  SUPPORT_EXPERIMENT_FIXTURE_SCHEMA,
  syntheticVerticalStressFixtureDocument,
  type SupportExperimentFixture,
} from "./supportExperimentFixture.ts";
import { compareBranchedModes, buildBranchedTreeFixture } from "./supportBranchedTree.ts";
import { SKIN_REBUILD_FKEI_SCHEMA } from "./fkei.ts";
import { canonicalStringify } from "../graphCore.ts";

function closeTo(actual: number, expected: number, tolerance = 1e-6): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

const synthetic = syntheticVerticalStressFixtureDocument();
const analysis = { scaleMmPerUnit: 1 };
const throughAdapter = compareFixtureModes(synthetic, analysis);

// 1. Synthetic fixture adapter -> 7adb9f2 baseline parity.
{
  const built = buildBranchedTreeFixture();
  const direct = compareBranchedModes(built.targets, built.options);
  assert.equal(
    canonicalStringify(throughAdapter.comparison),
    canonicalStringify(direct),
    "the fixture adapter must not drift from the direct 7adb9f2 baseline",
  );
  const indep = throughAdapter.comparison.independent.metrics;
  assert.equal(indep.targets.total, 5);
  assert.equal(indep.targets.supported, 5);
  assert.equal(indep.targets.unresolved, 0);
  assert.equal(indep.targets.critical, 1);
  assert.equal(indep.topology.independentTrunkCount, 5);
  closeTo(indep.bootstrap.maxBootstrapUnbracedLengthMm, 36.8, 0.05);
  closeTo(indep.bootstrap.meanBootstrapUnbracedLengthMm, 27.76, 0.01);
  assert.equal(indep.routing.independentRouteConflicts, 1);
  const shared = throughAdapter.comparison.shared.metrics;
  assert.equal(throughAdapter.comparison.shared.trees.length, 1);
  assert.equal(shared.topology.branchJunctionCount, 1);
  assert.equal(shared.topology.branches, 2);
  closeTo(shared.routing.maxBranchAngleFromVerticalDeg ?? -1, 10.62, 0.01);
  closeTo(shared.bootstrap.meanBootstrapUnbracedLengthMm, 11.6, 0.01);
  assert.equal(shared.routing.resolvedBySharingCount, 1);
  assert.equal(shared.routing.newConflictsIntroduced, 0);
  closeTo((shared.material.materialChangeVsCurrent ?? 0) * 100, -8.0, 0.05);
}

// 2. Fixture serialize / parse round-trip.
{
  const text = serializeSupportExperimentFixture(synthetic);
  const parsed = parseSupportExperimentFixture(text);
  assert.equal(canonicalStringify(parsed), canonicalStringify(synthetic));
  assert.equal(parsed.schema, SUPPORT_EXPERIMENT_FIXTURE_SCHEMA);
}

// 3. Invalid NaN fixture -> reject.
{
  const broken = JSON.parse(JSON.stringify(synthetic)) as SupportExperimentFixture;
  broken.targets[0].route.root.x = Number.NaN;
  assert.throws(() => parseSupportExperimentFixture(JSON.stringify(broken)), /non-finite/);
}

// 4. Invalid segment refs -> reject.
{
  const broken = JSON.parse(JSON.stringify(synthetic)) as Record<string, unknown>;
  const targets = broken["targets"] as Array<Record<string, unknown>>;
  const route = targets[0]["route"] as Record<string, unknown>;
  const segments = route["segments"] as Array<Record<string, unknown>>;
  delete segments[0]["end"];
  assert.throws(() => parseSupportExperimentFixture(JSON.stringify(broken)), /segment 0 end is not a point/);
}

// 5. Duplicate target IDs -> reject.
{
  const broken = JSON.parse(JSON.stringify(synthetic)) as SupportExperimentFixture;
  broken.targets[1].id = broken.targets[0].id;
  assert.throws(() => parseSupportExperimentFixture(JSON.stringify(broken)), /duplicate target id/);
}

// 6. Unknown physical scale -> accepted as unknown, no silent scale.
{
  assert.equal(synthetic.physical.targetLongestMm, null);
  assert.equal(synthetic.physical.permanentDiameterMm, null);
  const before = canonicalStringify(synthetic.targets.map((t) => t.route));
  const reparsed = parseSupportExperimentFixture(serializeSupportExperimentFixture(synthetic));
  assert.equal(canonicalStringify(reparsed.targets.map((t) => t.route)), before);
  assert.equal(reparsed.physical.targetLongestMm, null, "unknown scale must survive the round-trip");
  const note = throughAdapter.analysisScaleNote;
  assert.ok(note.includes("unknown"), `scale assumption must be explicit, got: ${note}`);
}

// 7. Author fixture load does not mutate the synthetic fixture.
{
  const registry = createSupportExperimentRegistry();
  const before = canonicalStringify(registry.getSynthetic());
  const author = {
    ...JSON.parse(JSON.stringify(synthetic)) as SupportExperimentFixture,
    id: "author-intake-check",
    label: "intake check (unit data, not author geometry)",
    kind: "author" as const,
  };
  registry.setAuthorFixture(author);
  assert.equal(canonicalStringify(registry.getSynthetic()), before);
  assert.equal(registry.getActiveId(), "author-intake-check");
}

// 8. Fixture switching -> algorithm result deterministic.
{
  const registry = createSupportExperimentRegistry();
  const first = compareFixtureModes(registry.getActive(), analysis);
  registry.setActive(registry.getSynthetic().id);
  const second = compareFixtureModes(registry.getActive(), analysis);
  assert.equal(
    canonicalStringify(first.comparison),
    canonicalStringify(second.comparison),
    "switching back must reproduce the identical comparison",
  );
}

// 9. Same algorithm parameters -> both fixture types use the same path.
{
  const registry = createSupportExperimentRegistry();
  const testAuthor = {
    ...JSON.parse(JSON.stringify(synthetic)) as SupportExperimentFixture,
    id: "test-fixture-same-params",
    label: "TEST FIXTURE (unit test, not author geometry)",
    kind: "author" as const,
  };
  registry.setAuthorFixture(testAuthor);
  const syntheticResult = compareFixtureModes(registry.getSynthetic(), analysis);
  const authorResult = compareFixtureModes(registry.getAuthor()!, analysis);
  assert.equal(syntheticResult.optionsFingerprint, authorResult.optionsFingerprint);
  assert.equal(
    canonicalStringify(syntheticResult.comparison),
    canonicalStringify(authorResult.comparison),
    "identical evidence through one path must give identical results",
  );
}

// 10. Author-kind fixture can contain diagonal / irregular route evidence.
// NOTE: TEST FIXTURE only — tiny neutral numerical data, never presented
// as an Author Organic Fixture (which only the author can supply).
{
  const irregular: SupportExperimentFixture = {
    schema: SUPPORT_EXPERIMENT_FIXTURE_SCHEMA,
    id: "test-fixture-irregular",
    label: "TEST FIXTURE (unit test, not author geometry)",
    kind: "synthetic",
    provenance: { source: "unit-test", sourceFingerprint: "test" },
    physical: { targetLongestMm: null, supportDiameterMm: null, permanentDiameterMm: null },
    plateZ: 0,
    body: { kind: "empty-space", units: "source", components: [], positions: [] },
    targets: [
      {
        id: "irregular-lean",
        route: {
          kind: "leaning",
          root: { x: 2, y: 1, z: 0 },
          neckStart: { x: 14, y: -3, z: 21 },
          target: { x: 14, y: -3, z: 22 },
          segments: [
            { start: { x: 2, y: 1, z: 0 }, end: { x: 14, y: -3, z: 21 }, radius: 0.8 },
            { start: { x: 14, y: -3, z: 21 }, end: { x: 14, y: -3, z: 22 }, radius: 0.4 },
          ],
        },
        critical: false,
        highRisk: true,
      },
      {
        id: "irregular-tall",
        route: {
          kind: "vertical",
          root: { x: 40, y: 5, z: 0 },
          neckStart: { x: 40, y: 5, z: 34 },
          target: { x: 40, y: 5, z: 35 },
          segments: [
            { start: { x: 40, y: 5, z: 0 }, end: { x: 40, y: 5, z: 34 }, radius: 0.8 },
            { start: { x: 40, y: 5, z: 34 }, end: { x: 40, y: 5, z: 35 }, radius: 0.4 },
          ],
        },
        critical: true,
      },
    ],
  };
  const result = compareFixtureModes(irregular, analysis);
  assert.equal(result.comparison.independent.metrics.targets.total, 2);
  assert.equal(result.comparison.independent.metrics.targets.supported, 2);
  assert.equal(result.fixtureId, "test-fixture-irregular");
}

// 11. Multiple BODY components do not automatically invalidate the fixture.
{
  // Two disjoint unit-ring triangles as separate components (source units).
  const soup = [
    0, 0, 5, 1, 0, 5, 0, 1, 5,
    50, 0, 5, 51, 0, 5, 50, 1, 5,
  ];
  const sdf = buildTriangleSoupSdf(soup);
  closeTo(sdf(0, 0, 5), 0, 1e-9);
  closeTo(sdf(0.2, 0.2, 6), Math.hypot(0.2 - 1 / 3, 0.2 - 1 / 3, 1) > 0 ? sdf(0.2, 0.2, 6) : -1, 1e-9);
  assert.ok(sdf(0, 0, 10) > 4, "far field stays clear");
  const multi: SupportExperimentFixture = {
    ...JSON.parse(JSON.stringify(synthetic)) as SupportExperimentFixture,
    id: "test-fixture-multi-body",
    label: "TEST FIXTURE (unit test, not author geometry)",
    body: {
      kind: "triangle-soup",
      units: "source",
      components: [
        { id: "shell-a", triangleCount: 1 },
        { id: "shell-b", triangleCount: 1 },
      ],
      positions: soup,
    },
  };
  const parsed = parseSupportExperimentFixture(JSON.stringify(multi));
  assert.equal(parsed.body.components.length, 2);
  const result = compareFixtureModes(parsed, analysis);
  assert.equal(result.comparison.independent.metrics.targets.supported, 5);
}

// 12. Invalid author load -> previous valid state preserved.
{
  const registry = createSupportExperimentRegistry();
  const valid = {
    ...JSON.parse(JSON.stringify(synthetic)) as SupportExperimentFixture,
    id: "author-valid-hold",
    label: "intake hold (unit data, not author geometry)",
    kind: "author" as const,
  };
  registry.setAuthorFixture(valid);
  assert.throws(() => registry.setAuthorFixture({ schema: "nope" }), /unsupported schema/);
  assert.equal(registry.getAuthor()?.id, "author-valid-hold");
  assert.equal(registry.getActiveId(), "author-valid-hold");
  const rerun = compareFixtureModes(registry.getActive(), analysis);
  assert.equal(rerun.fixtureId, "author-valid-hold");
}

// 13. Fixture export/capture does not mutate the Golden project input.
{
  const evidence = {
    id: "capture-check",
    label: "capture check",
    kind: "synthetic" as const,
    provenance: { source: "golden-project-mock", sourceFingerprint: "mock" },
    physical: { targetLongestMm: null, supportDiameterMm: 1.6, permanentDiameterMm: null },
    plateZ: 0,
    body: { kind: "empty-space" as const, units: "source" as const, components: [], positions: [] as number[] },
    targets: synthetic.targets.map((t) => ({ ...t })),
  };
  const before = canonicalStringify(evidence);
  const captured = captureSupportExperimentFixture(evidence);
  assert.equal(canonicalStringify(evidence), before, "capture must not mutate its input");
  assert.equal(captured.id, "capture-check");
  assert.equal(canonicalStringify(parseSupportExperimentFixture(serializeSupportExperimentFixture(captured))), canonicalStringify(captured));
}

// 14. No FKEI schema change.
assert.equal(SKIN_REBUILD_FKEI_SCHEMA, "katachi.skin-rebuild.fkei.v1");
assert.ok(
  SUPPORT_EXPERIMENT_FIXTURE_SCHEMA !== (SKIN_REBUILD_FKEI_SCHEMA as string),
  "the experiment contract must stay distinct from the production FKEI schema",
);

// 15. Existing branched-tree baseline remains reachable through the adapter.
{
  const rebuilt = compareFixtureModes(
    parseSupportExperimentFixture(serializeSupportExperimentFixture(synthetic)),
    analysis,
  );
  assert.equal(
    canonicalStringify(rebuilt.comparison),
    canonicalStringify(throughAdapter.comparison),
  );
}

// Cross-fixture warnings: identical evidence -> silent; degraded -> observed.
{
  const quiet = detectOrganicGeneralizationWarnings(
    throughAdapter.comparison,
    throughAdapter.comparison,
  );
  assert.deepEqual(quiet, []);
  const degraded = JSON.parse(JSON.stringify(throughAdapter.comparison)) as typeof throughAdapter.comparison;
  degraded.shared.metrics.bootstrap.meanBootstrapUnbracedLengthMm += 5;
  degraded.shared.metrics.targets.unresolved += 1;
  const warnings = detectOrganicGeneralizationWarnings(throughAdapter.comparison, degraded);
  assert.ok(warnings.length >= 2, `expected observations, got: ${warnings.join(" | ")}`);
  assert.ok(warnings.every((w) => w.startsWith("observation:")));
}

console.log("support experiment fixture v0: focused checks passed");

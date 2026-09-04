import assert from "node:assert/strict";
import {
  bootstrapDebugScene,
  buildVerticalStressFixture,
  compareBootstrapModes,
  supportBootstrapFootingFingerprint,
  type BootstrapTrunkInput,
} from "./supportBootstrapFooting.ts";
import { canonicalStringify } from "../graphCore.ts";

const fixture = buildVerticalStressFixture();
const comparison = compareBootstrapModes(fixture.inputs, fixture.options);
const byId = (ids: readonly { id: string }[]) => ids.map((t) => t.id).sort();

// Fixture classification sanity: short / mid / long-isolated / long-paired.
assert.deepEqual(
  comparison.current.trunks.map((t) => `${t.id}:${t.classification}`),
  [
    "trunk-short:early-stable",
    "trunk-mid:mid",
    "trunk-long-a:long-bootstrap",
    "trunk-long-b:long-bootstrap",
    "trunk-long-solo:long-bootstrap",
  ],
);

// 1. Short bootstrap -> no reinforcement.
assert.ok(
  comparison.combined.thickenings.every((t) => t.trunkId !== "trunk-short"),
  "early-stable trunk must receive no root reinforcement",
);
assert.ok(
  comparison.root.thickenings.every((t) => t.trunkId !== "trunk-short"),
);

// 2. Long isolated trunk -> root thickening eligible (no neighbor brace).
{
  const solo = comparison.combined.thickenings.filter((t) => t.trunkId === "trunk-long-solo");
  assert.equal(solo.length, 1);
  assert.equal(solo[0].status, "applied");
  assert.equal(solo[0].appliedRootDiameterMm, 2.4);
  assert.ok(solo[0].extraVolumeMm3 > 0, "thickening must add material");
  assert.ok(
    comparison.combined.braces.every((b) => b.trunkAId !== "trunk-long-solo" && b.trunkBId !== "trunk-long-solo"),
    "isolated trunk must not gain a brace",
  );
}

// 3. Long trunk + nearby support -> low brace eligible.
{
  const braces = comparison.combined.braces.filter((b) => b.status === "candidate");
  assert.equal(braces.length, 1);
  const brace = braces[0];
  assert.deepEqual([brace.trunkAId, brace.trunkBId].sort(), ["trunk-long-a", "trunk-long-b"]);
  assert.ok(
    brace.angleFromVerticalDeg <= 45 + 1e-6,
    `low brace must respect the 45° initial candidate ceiling (got ${brace.angleFromVerticalDeg})`,
  );
  assert.ok(
    Math.max(brace.attachHeightAMm, brace.attachHeightBMm) <= 6 + 1e-9,
    "low brace must attach inside the plate-near band",
  );
  const a = comparison.combined.trunks.find((t) => t.id === "trunk-long-a");
  assert.equal(a?.braceCount, 1);
  assert.equal(a?.lowBraceCount, 1);
}

// 4. BODY between roots -> brace reject.
{
  const wallSdf = (x: number, _y: number, _z: number) => Math.abs(x - 62) - 1;
  const walled = buildVerticalStressFixture({ bodySdf: wallSdf });
  const result = compareBootstrapModes(walled.inputs, walled.options);
  const rejected = result.combined.braces.filter((b) => b.status === "rejected");
  assert.equal(rejected.length, 1, "wall between roots must reject the low brace");
  assert.ok((rejected[0].rejectReason ?? "").includes("BODY"), `reason was: ${rejected[0].rejectReason}`);
  assert.equal(result.combined.compare.bodyCollisionCount, 0, "rejected braces must never collide");
}

// 5. Root thickening hits BODY -> shrink safely, then reject.
{
  // Small blob beside the solo root: full diameter collides, shrunk fits.
  const blobSdf = (x: number, y: number, z: number) => Math.hypot(x - 101.3, y, z - 2) - 0.3;
  const blob = buildVerticalStressFixture({ bodySdf: blobSdf });
  const shrunk = compareBootstrapModes(blob.inputs, blob.options).combined.thickenings.find(
    (t) => t.trunkId === "trunk-long-solo",
  );
  assert.equal(shrunk?.status, "shrunk");
  assert.ok(
    (shrunk?.appliedRootDiameterMm ?? 0) < 2.4 && (shrunk?.appliedRootDiameterMm ?? 0) > 1.6,
    `shrunk diameter must stay between normal and full (got ${shrunk?.appliedRootDiameterMm})`,
  );
  // Large blob: every ladder step collides -> reject, never force.
  const bigBlobSdf = (x: number, y: number, z: number) => Math.hypot(x - 101.0, y, z - 2) - 0.3;
  const big = buildVerticalStressFixture({ bodySdf: bigBlobSdf });
  const rejected = compareBootstrapModes(big.inputs, big.options).combined.thickenings.find(
    (t) => t.trunkId === "trunk-long-solo",
  );
  assert.equal(rejected?.status, "rejected");
  assert.ok((rejected?.rejectReason ?? "").includes("BODY"), `reason was: ${rejected?.rejectReason}`);
  assert.equal(rejected?.extraVolumeMm3, 0, "rejected thickening must add no material");
}

// 6. Intentional brace junction -> allowed (never counted as fusion).
{
  assert.ok(
    comparison.combined.braces.some((b) => b.status === "candidate"),
    "intentional low brace must be allowed",
  );
  assert.equal(
    comparison.combined.compare.removalRiskAdjacencyCount,
    0,
    "intentional junctions must not count as removal-risk adjacency",
  );
}

// 7. Unintentional neighboring fusion -> reject thickening.
{
  // Full vertical routes at close roots (30 tall, neck 1).
  const tall = (x: number): BootstrapTrunkInput["route"] => ({
    kind: "vertical",
    root: { x, y: 0, z: 0 },
    neckStart: { x, y: 0, z: 29 },
    target: { x, y: 0, z: 30 },
    segments: [
      { start: { x, y: 0, z: 0 }, end: { x, y: 0, z: 29 }, radius: 0.8 },
      { start: { x, y: 0, z: 29 }, end: { x, y: 0, z: 30 }, radius: 0.4 },
    ],
  });
  const pair: BootstrapTrunkInput[] = [
    { id: "close-a", route: tall(60) },
    { id: "close-b", route: tall(61.5) },
  ];
  const result = compareBootstrapModes(pair, fixture.options);
  for (const thickening of result.combined.thickenings) {
    assert.equal(thickening.status, "rejected", "1.5 mm-apart roots must refuse thickening");
    assert.ok(
      (thickening.rejectReason ?? "").includes("fusion"),
      `reason was: ${thickening.rejectReason}`,
    );
  }
}

// 8. Root taper finite / deterministic / monotone to normal diameter.
{
  const applied = comparison.combined.thickenings.find((t) => t.trunkId === "trunk-long-solo");
  assert.ok(applied && applied.status === "applied");
  const profile = applied.profile;
  assert.ok(profile.length >= 3, "taper profile must carry lower + taper points");
  for (let i = 0; i < profile.length; i++) {
    assert.ok(Number.isFinite(profile[i].heightMm) && Number.isFinite(profile[i].radiusSource));
    if (i > 0) {
      assert.ok(profile[i].heightMm > profile[i - 1].heightMm, "taper heights must ascend");
      assert.ok(profile[i].radiusSource <= profile[i - 1].radiusSource + 1e-12, "taper radii must not grow");
    }
  }
  assert.equal(profile[0].radiusSource, 1.2, "taper starts at the thickened root radius");
  assert.equal(profile[profile.length - 1].radiusSource, 0.8, "taper ends at the normal trunk radius");
  assert.equal(profile[profile.length - 1].heightMm, 10, "4 mm reinforcement + 6 mm taper");
}

// 9. Same input -> same result.
{
  const again = compareBootstrapModes(fixture.inputs, fixture.options);
  assert.equal(
    supportBootstrapFootingFingerprint(comparison),
    supportBootstrapFootingFingerprint(again),
  );
  assert.equal(canonicalStringify(comparison), canonicalStringify(again));
}

// 10. Current mode -> existing Print #2 topology unchanged (analysis only).
{
  const before = canonicalStringify(fixture.inputs.map((input) => input.route));
  const current = comparison.current;
  assert.deepEqual(current.thickenings, []);
  assert.deepEqual(current.braces, []);
  assert.equal(current.compare.totalExtraSupportVolumeMm3, 0);
  assert.equal(current.compare.rootReinforcedCount, 0);
  assert.equal(current.compare.lowBraceCount, 0);
  assert.equal(canonicalStringify(fixture.inputs.map((input) => input.route)), before);
  assert.equal(current.version, "support-bootstrap-footing-v0-experimental");
}

// Compare-mode metric directions on the fixture.
assert.ok(
  comparison.brace.compare.meanBootstrapUnbracedLengthMm
    < comparison.current.compare.meanBootstrapUnbracedLengthMm,
  "low braces must shorten the mean bootstrap length",
);
assert.equal(comparison.current.compare.maxBootstrapUnbracedLengthMm, 29);
assert.equal(
  comparison.root.compare.maxBootstrapUnbracedLengthMm,
  29,
  "thickening strengthens roots; it does not shorten the bootstrap",
);
assert.ok(
  comparison.combined.compare.totalExtraSupportVolumeMm3
    > comparison.root.compare.totalExtraSupportVolumeMm3,
  "combined mode must add brace material on top of thickening",
);
assert.deepEqual(byId(comparison.current.trunks), [
  "trunk-long-a",
  "trunk-long-b",
  "trunk-long-solo",
  "trunk-mid",
  "trunk-short",
]);

// Debug scene is bounded presentation data (viewer input, not geometry).
{
  const scene = bootstrapDebugScene(comparison.combined);
  assert.equal(scene.roots.length, 5);
  assert.equal(scene.junctions.length, 5);
  assert.ok(scene.thickenedSegments.length > 0);
  assert.equal(scene.braces.length, 1);
}

console.log("support bootstrap footing v0: focused checks passed");

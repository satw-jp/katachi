import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  assertSkinRebuildGoldenSnapshot,
  SKIN_REBUILD_GOLDEN_EXPECTED,
  SKIN_REBUILD_GOLDEN_FKEI,
} from "./goldenOffsetBendRegression.ts";

const goldenFkeiPath = String.raw`J:\My Drive\codex\2026-08-31\katachi-print-002-support-free\outputs\skin-rebuild-print-002-support-free.fkei`;
const goldenFkei = readFileSync(goldenFkeiPath);

assert.equal(goldenFkei.byteLength, SKIN_REBUILD_GOLDEN_FKEI.bytes, "golden FKEI byte count changed");
assert.equal(
  createHash("sha256").update(goldenFkei).digest("hex"),
  SKIN_REBUILD_GOLDEN_FKEI.sha256,
  "golden FKEI SHA256 changed",
);
assertSkinRebuildGoldenSnapshot(SKIN_REBUILD_GOLDEN_EXPECTED);

assert.deepEqual(
  {
    all: [SKIN_REBUILD_GOLDEN_EXPECTED.stage4.allFaceCount, SKIN_REBUILD_GOLDEN_EXPECTED.stage4.allRegionCount],
    inside: [SKIN_REBUILD_GOLDEN_EXPECTED.stage4.insideFaceCount, SKIN_REBUILD_GOLDEN_EXPECTED.stage4.insideRegionCount],
    outside: [SKIN_REBUILD_GOLDEN_EXPECTED.stage4.outsideFaceCount, SKIN_REBUILD_GOLDEN_EXPECTED.stage4.outsideRegionCount],
  },
  { all: [1224, 86], inside: [736, 73], outside: [488, 53] },
  "Stage 4 golden classification changed",
);
assert.deepEqual(
  {
    critical: SKIN_REBUILD_GOLDEN_EXPECTED.criticalTargets.count,
    edges: SKIN_REBUILD_GOLDEN_EXPECTED.supportGraph.edgeCount,
    supported: SKIN_REBUILD_GOLDEN_EXPECTED.diagnostics.supportedTargetCount,
    unsupported: SKIN_REBUILD_GOLDEN_EXPECTED.diagnostics.unsupportedTargetCount,
    straightBodyRejects: SKIN_REBUILD_GOLDEN_EXPECTED.diagnostics.straightRejectedByBody,
    acceptedBodyCollisions: SKIN_REBUILD_GOLDEN_EXPECTED.diagnostics.acceptedBodyCollisionCount,
    insideDerived: SKIN_REBUILD_GOLDEN_EXPECTED.diagnostics.insideDerivedSupportCount,
    vertical: SKIN_REBUILD_GOLDEN_EXPECTED.diagnostics.verticalCount,
    bent: SKIN_REBUILD_GOLDEN_EXPECTED.diagnostics.offsetBendCount,
  },
  {
    critical: 166,
    edges: 390,
    supported: 156,
    unsupported: 10,
    straightBodyRejects: 88,
    acceptedBodyCollisions: 0,
    insideDerived: 0,
    vertical: 78,
    bent: 78,
  },
  "Stage 8 golden support diagnostics changed",
);
assert.equal(SKIN_REBUILD_GOLDEN_EXPECTED.representativeRoutes.vertical?.kind, "vertical");
assert.equal(SKIN_REBUILD_GOLDEN_EXPECTED.representativeRoutes.offsetBend?.kind, "leaning");
assert.notDeepEqual(
  SKIN_REBUILD_GOLDEN_EXPECTED.representativeRoutes.offsetBend?.bend,
  SKIN_REBUILD_GOLDEN_EXPECTED.representativeRoutes.offsetBend?.target,
  "offset-bend route must retain a distinct bend before the neck and target",
);

console.log("skin-rebuild golden offset-bend regression passed");

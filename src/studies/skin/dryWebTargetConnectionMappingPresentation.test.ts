import assert from "node:assert/strict";
import {
  createDryWebTargetConnectionMappingPresentation,
  DRY_WEB_TARGET_CONNECTION_MAPPING_COPY,
} from "./dryWebTargetConnectionMappingPresentation.ts";
import type { TargetedGridTargetConnectionFact } from "./targetedGrid.ts";

const sourceTargets = [
  { assignmentId: "source-late" },
  { assignmentId: "source-first" },
];
const facts: TargetedGridTargetConnectionFact[] = [
  { sourceTargetIndex: 1, contactNodeId: 8, materialNodeId: 3, edgeId: 4, status: "connected" },
  { sourceTargetIndex: 0, contactNodeId: null, materialNodeId: null, edgeId: null, status: "unresolved" },
];

const missing = createDryWebTargetConnectionMappingPresentation({
  current: false,
  running: false,
  stale: false,
  facts: null,
  sourceTargets: null,
});
assert.equal(missing.state, "missing");
assert.equal(missing.connectedCount, null);
assert.equal(missing.totalCount, null);

const running = createDryWebTargetConnectionMappingPresentation({
  current: true,
  running: true,
  stale: false,
  facts,
  sourceTargets,
});
assert.equal(running.state, "running");
assert.equal(running.totalCount, null);

const stale = createDryWebTargetConnectionMappingPresentation({
  current: false,
  running: false,
  stale: true,
  facts,
  sourceTargets,
});
assert.equal(stale.state, "stale");
assert.equal(stale.connectedCount, null);
assert.ok(stale.reason.includes("Stage 3を再Graph化"));
assert.ok(stale.reason.includes("Dry Webを再生成"));

const factsBefore = JSON.stringify(facts);
const sourceBefore = JSON.stringify(sourceTargets);
const current = createDryWebTargetConnectionMappingPresentation({
  current: true,
  running: false,
  stale: false,
  facts,
  sourceTargets,
});
assert.deepEqual(
  {
    state: current.state,
    connectedCount: current.connectedCount,
    unresolvedCount: current.unresolvedCount,
    totalCount: current.totalCount,
    available: current.available,
  },
  { state: "current", connectedCount: 1, unresolvedCount: 1, totalCount: 2, available: true },
);
assert.equal(current.copy, DRY_WEB_TARGET_CONNECTION_MAPPING_COPY);
assert.equal(JSON.stringify(facts), factsBefore, "presentation must not mutate mapping facts");
assert.equal(JSON.stringify(sourceTargets), sourceBefore, "presentation must not mutate source targets");
assert.ok(!JSON.stringify(facts).includes("assignmentId"), "compact facts must not duplicate assignmentId strings");

const repeated = createDryWebTargetConnectionMappingPresentation({
  current: true,
  running: false,
  stale: false,
  facts,
  sourceTargets,
});
assert.deepEqual(repeated, current, "same current facts produce deterministic presentation");

for (const malformedFacts of [
  facts.slice(0, 1),
  [{ ...facts[0], sourceTargetIndex: 2 }, facts[1]],
  [{ ...facts[0], sourceTargetIndex: 0 }, facts[1]],
  [{ ...facts[0], status: "invalid" as "connected" }, facts[1]],
  [{ ...facts[0], contactNodeId: null }, facts[1]],
  [{ ...facts[0], edgeId: -1 }, facts[1]],
  [{ ...facts[0], status: "unresolved", contactNodeId: 1 }, facts[1]],
] as TargetedGridTargetConnectionFact[][]) {
  const invalid = createDryWebTargetConnectionMappingPresentation({
    current: true,
    running: false,
    stale: false,
    facts: malformedFacts,
    sourceTargets,
  });
  assert.equal(invalid.state, "missing");
  assert.equal(invalid.totalCount, null);
}

const invalidSource = createDryWebTargetConnectionMappingPresentation({
  current: true,
  running: false,
  stale: false,
  facts,
  sourceTargets: [{ assignmentId: "" }, sourceTargets[1]],
});
assert.equal(invalidSource.state, "missing");
assert.equal(invalidSource.totalCount, null);

const benchmarkCreationStarted = performance.now();
const benchmarkSources = Array.from({ length: 100_000 }, (_, index) => ({ assignmentId: `source-${index}` }));
const benchmarkFacts: TargetedGridTargetConnectionFact[] = Array.from({ length: 100_000 }, (_, index) => ({
  sourceTargetIndex: index,
  contactNodeId: index,
  materialNodeId: index + 100_000,
  edgeId: index,
  status: "connected" as const,
}));
const benchmarkCreationElapsed = performance.now() - benchmarkCreationStarted;
const benchmarkFactJsonBytes = new TextEncoder().encode(JSON.stringify(benchmarkFacts)).byteLength;
const benchmarkStarted = performance.now();
const benchmark = createDryWebTargetConnectionMappingPresentation({
  current: true,
  running: false,
  stale: false,
  facts: benchmarkFacts,
  sourceTargets: benchmarkSources,
});
const benchmarkElapsed = performance.now() - benchmarkStarted;
assert.equal(benchmark.totalCount, 100_000);
assert.equal(benchmark.connectedCount, 100_000);
assert.equal(JSON.stringify(benchmarkFacts).includes("assignmentId"), false);
console.log(`[target mapping perf] 100k compact facts: create=${benchmarkCreationElapsed.toFixed(1)}ms; present=${benchmarkElapsed.toFixed(1)}ms; JSON=${benchmarkFactJsonBytes}B; assignmentId fields in facts=0`);

console.log("dryWebTargetConnectionMappingPresentation: all assertions passed");

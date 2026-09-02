import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
} from "./fkei.ts";
import { fkeiShapeFingerprint } from "../fkeiRestoreIdentity.ts";
import { replay, type SkinHistoryEntry } from "../history.ts";
import { mergeSkinRebuildGraphsAtSupportContacts } from "./model.ts";
import {
  decodeSkinRebuildPrintSnapshot,
  evaluateSkinRebuildPrintSnapshotReuse,
} from "./printSnapshot.ts";
import {
  createSkinViewportSessionState,
  recommendSkinViewportOverlay,
  recommendSkinViewportView,
  selectSkinViewportOverlay,
  selectSkinViewportView,
} from "../viewportMode.ts";

const sampleBytes = readFileSync(new URL(
  "../../../../public/samples/skin-rebuild-completed-print-ready.fkei",
  import.meta.url,
));
const document = parseSkinRebuildFkei(sampleBytes.toString("utf8"));
assert.ok(document.printSnapshot, "Completed Sample must be a real FKEI with a Print Snapshot");
assert.equal(document.printApproval, false, "the sample must remain unapproved for physical printing");

const snapshot = document.printSnapshot!;
const data = decodeSkinRebuildPrintSnapshot(snapshot);
const project = projectFromSkinRebuildFkei(document);
const recipe = JSON.parse(document.shapeRecipe!) as { entries: SkinHistoryEntry[] };
const state = replay(recipe.entries);
assert.equal(snapshot.sourceGeometryFingerprint, fkeiShapeFingerprint(state), "snapshot source fingerprint must match the FKEI recipe");
assert.equal(project.settings.exportResolution, 128, "the current print-ready sample must use the current export resolution");
assert.equal(data.body.topologyDiagnostics.componentCount, 1, "the cached BODY must be one component");
assert.equal(data.body.topologyDiagnostics.degenerateFaceIndices.length, 0, "the cached BODY must have no degenerate faces");
assert.equal(data.componentSelection.explicit, true, "the completed sample must restore an explicit component selection");
assert.ok(data.componentSelection.componentIds.length > 0, "the completed sample must keep at least one BODY component");
assert.equal(data.componentSelection.triangleCount, data.body.topologyDiagnostics.triangleCount);
assert.equal(data.stage8.supportMode, "automatic");
assert.equal(data.stage8.sparseSupportGenerated, true);
assert.equal(data.stage8.unresolvedSupportCount, 0);
assert.equal(data.stage8.acceptedBodyCollisionCount, 0);
assert.equal(data.stage8.diagnostics?.unsupportedTargetCount, 0);
assert.equal(data.stage8.diagnostics?.acceptedBodyCollisionCount, 0);
assert.equal(data.internalPrintGate.report.ok, true);
assert.equal(data.internalPrintGate.report.invalidDiameterCount, 0);
assert.equal(data.internalPrintGate.report.thinStrutCount, 0);
assert.equal(data.internalPrintGate.report.unsupportedNodes, 0);
assert.equal(data.internalPrintGate.report.unsupportedEdges, 0);
assert.equal(data.internalPrintGate.report.floatingGraphComponents, 0);
assert.equal(data.internalPrintGate.report.meshComponents, data.componentSelection.componentIds.length);
assert.equal(
  new DataView(data.internalPrintGate.stl).getUint32(80, true),
  data.componentSelection.triangleCount,
  "the cached BODY STL must match the selected BODY triangle count",
);
for (const stage of [data.stage4, data.stage6_5, data.stage7, data.stage7_5, data.stage8]) {
  assert.equal(stage.current, true, "all restored print stages must be current");
}
assert.equal(data.stage7_5.ambiguousFaceCount, 0);
assert.equal(data.stage7_5.ambiguousRegionCount, 0);
assert.doesNotMatch(JSON.stringify(snapshot), /approval/i, "session-only risk approvals must not be persisted");

function gateFingerprint(
  graph: ReturnType<typeof mergeSkinRebuildGraphsAtSupportContacts>,
  selection: { cacheFingerprint: string; componentIds: number[]; triangleCount: number } | null,
): string {
  return JSON.stringify({
    history: recipe.entries,
    mode: state.mode,
    resolution: 128,
    targetLongestMm: project.settings.targetLongestMm,
    graphKind: graph.kind,
    nodes: graph.nodes.map((node) => [node.id, node.position.x, node.position.y, node.position.z, node.radius]),
    edges: graph.edges.map((edge) => [edge.start, edge.end, edge.radius]),
    exportComponentSelection: selection
      ? { cacheFingerprint: selection.cacheFingerprint, componentIds: selection.componentIds, triangleCount: selection.triangleCount }
      : null,
  });
}

const bodyFingerprint = gateFingerprint(project.finalGraph, null);
assert.equal(data.body.fingerprint, bodyFingerprint, "cached BODY fingerprint must match the current graph/settings identity");
const reachabilityGraph = mergeSkinRebuildGraphsAtSupportContacts(project.finalGraph, project.printSupport);
const currentGateFingerprint = gateFingerprint(reachabilityGraph, {
  cacheFingerprint: bodyFingerprint,
  componentIds: data.componentSelection.componentIds,
  triangleCount: data.componentSelection.triangleCount,
});
const currentPipelineFingerprint = JSON.stringify({
  gateFingerprint: currentGateFingerprint,
  supportMode: "automatic",
  settings: {
    baseStretch: project.settings.baseStretch,
    patternCount: project.settings.patternCount,
    strutDiameterMm: project.settings.strutDiameterMm,
    targetLongestMm: project.settings.targetLongestMm,
    surfaceThickness: project.settings.surfaceThickness,
    patternRadius: project.settings.patternRadius,
    roundK: project.settings.roundK,
    overhangThresholdDeg: project.settings.overhangThresholdDeg,
    analysisResolution: project.settings.analysisResolution,
    exportResolution: project.settings.exportResolution,
    supportDiameterMm: project.settings.supportDiameterMm,
  },
});
assert.equal(snapshot.pipelineFingerprint, currentPipelineFingerprint, "snapshot pipeline fingerprint must match normal Open restore inputs");

const reusable = evaluateSkinRebuildPrintSnapshotReuse({
  snapshot,
  data,
  currentSourceGeometryFingerprint: fkeiShapeFingerprint(state),
  currentPipelineFingerprint,
  currentGateFingerprint,
  currentSupportGraphFingerprint: data.stage8.supportGraphFingerprint,
  currentSupportGraphNodeCount: data.stage8.supportGraphNodeCount,
  currentSupportGraphEdgeCount: data.stage8.supportGraphEdgeCount,
  currentSupportMode: "automatic",
  currentSparseSupportDiagnostics: data.stage8.diagnostics,
});
assert.equal(reusable.state, "reuse", "the real Completed Sample must reuse its Print Snapshot");
const stale = evaluateSkinRebuildPrintSnapshotReuse({
  snapshot,
  data,
  currentSourceGeometryFingerprint: "changed-geometry",
  currentPipelineFingerprint,
  currentGateFingerprint,
  currentSupportGraphFingerprint: data.stage8.supportGraphFingerprint,
  currentSupportGraphNodeCount: data.stage8.supportGraphNodeCount,
  currentSupportGraphEdgeCount: data.stage8.supportGraphEdgeCount,
  currentSupportMode: "automatic",
  currentSparseSupportDiagnostics: data.stage8.diagnostics,
});
assert.equal(stale.state, "stale", "a changed source fingerprint must fail closed");

// Completed Sample entry state is explicit and session-only. Once selected,
// normal Stage recommendations must not hide the restored Mesh or Support.
let reviewState = createSkinViewportSessionState();
reviewState = selectSkinViewportView(reviewState, "mesh");
reviewState = selectSkinViewportOverlay(reviewState, "support");
reviewState = recommendSkinViewportView(reviewState, "field");
reviewState = recommendSkinViewportOverlay(reviewState, "none");
assert.equal(reviewState.view, "mesh");
assert.equal(reviewState.overlay, "support");
assert.equal(reviewState.userHasSelectedViewportMode, true);
assert.equal(reviewState.userHasSelectedOverlay, true);
reviewState = selectSkinViewportView(reviewState, "field");
reviewState = selectSkinViewportOverlay(reviewState, "printRisk");
reviewState = recommendSkinViewportView(reviewState, "mesh");
reviewState = recommendSkinViewportOverlay(reviewState, "support");
assert.equal(reviewState.view, "field", "a later user View choice must survive Stage recommendations");
assert.equal(reviewState.overlay, "printRisk", "a later user Overlay choice must survive Stage recommendations");

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const restoreWorkerSource = readFileSync(new URL("./completedSampleRestore.worker.ts", import.meta.url), "utf8");
assert.match(mainSource, /openCompletedSkinRebuildSample\(file\)/, "Completed Sample must use its dedicated restore path");
assert.match(mainSource, /new Worker\(new URL\("\.\/rebuild\/completedSampleRestore\.worker\.ts"/, "Completed Sample restore must use a Worker");
assert.match(mainSource, /applyCompletedSkinRebuildSampleReviewState\(\)/, "Completed Sample must set its initial review state");
assert.match(mainSource, /snapshotRestored: result\.snapshot !== null/, "Completed Sample telemetry must report snapshot restoration");
assert.match(mainSource, /assetFetchMs/, "Completed Sample telemetry must record asset fetch timing");
assert.match(mainSource, /totalLoadRestoreMs/, "Completed Sample telemetry must record end-to-end restore timing");
assert.match(restoreWorkerSource, /parseSkinRebuildFkei/);
assert.match(restoreWorkerSource, /decodeSkinRebuildPrintSnapshot/);
assert.match(restoreWorkerSource, /projectFromSkinRebuildFkei/);
assert.match(restoreWorkerSource, /workerElapsedMs/);
assert.match(styleSource, /\.skin-workflow-review-pane\s*\{\s*display: contents;/, "narrow layouts must retain the prior pane flow");
assert.match(styleSource, /\.skin-right-pane \.skin-pane-body[\s\S]*?grid-template-rows: minmax\(0, 1fr\) minmax\(0, 1fr\)/, "desktop right pane must be exact 50/50");
assert.match(styleSource, /\.skin-workflow-review-pane[\s\S]*?min-height: 0[\s\S]*?overflow: auto/, "workflow half must have bounded independent scrolling");

// The synchronous fixture assertions above and the worker's shared parse /
// normalize / decode functions are the old-vs-worker result parity boundary.
// No Stage 4–8 rebuild is invoked while opening this completed snapshot.
assert.equal(project.printSupport.edges.length, data.stage8.supportGraphEdgeCount);
assert.equal(data.stage8.diagnostics?.generatedSupportCount, data.stage8.supportGraphEdgeCount);
assert.equal(data.stage8.diagnostics?.acceptedBodyCollisionCount, 0);
assert.equal(data.stage8.diagnostics?.insideDerivedSupportCount, 0);
const restoreSource = mainSource.slice(
  mainSource.indexOf("function restoreSkinRebuildFkei"),
  mainSource.indexOf("async function openCompletedSkinRebuildSample"),
);
assert.doesNotMatch(restoreSource, /buildSkinMesh|buildSparseRemovableSupport|startSkinRebuildStage/, "snapshot restore must not rerun Stage 4–8 heavy builders");

console.log("SKIN REBUILD completed Print-ready Sample tests passed", JSON.stringify({
  bytes: sampleBytes.byteLength,
  snapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)),
  triangleCount: data.body.topologyDiagnostics.triangleCount,
  supportEdges: data.stage8.supportGraphEdgeCount,
  unresolvedSupportCount: data.stage8.unresolvedSupportCount,
  stage6RemeshRunsOnRestore: 0,
  stage4to8HeavyRediagnosisRunsOnRestore: 0,
}));

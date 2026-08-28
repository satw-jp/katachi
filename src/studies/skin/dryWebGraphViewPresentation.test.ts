import {
  createDryWebGraphViewPresentation,
  DRY_WEB_GRAPH_VIEW_OPTIONS,
  preserveDryWebGraphViewForCompletion,
  preserveDryWebGraphViewState,
} from "./dryWebGraphViewPresentation.ts";

const graph = {
  kind: "targetedGrid",
  nodes: [{ id: 1 }, { id: 2 }, { id: 3 }],
  edges: [{ a: 1, b: 2 }, { a: 2, b: 3 }],
};
const before = JSON.stringify(graph);

const missing = createDryWebGraphViewPresentation({ graph: null, current: false, running: false, stale: false });
if (missing.state !== "missing" || missing.nodeCount !== null || missing.edgeCount !== null || missing.buttonsEnabled) {
  throw new Error("missing graph must be unavailable without counts");
}

const running = createDryWebGraphViewPresentation({ graph, current: true, running: true, stale: false });
if (running.state !== "running" || running.nodeCount !== null || running.edgeCount !== null || running.buttonsEnabled) {
  throw new Error("running graph must be unavailable without counts");
}

const stale = createDryWebGraphViewPresentation({ graph: null, current: false, running: false, stale: true });
if (stale.state !== "stale" || stale.nodeCount !== null || stale.edgeCount !== null || stale.buttonsEnabled) {
  throw new Error("stale graph must clear old counts and disable actions");
}
if (!stale.reason.includes("Stage 3を再Graph化") || !stale.reason.includes("Dry Webを再生成")) {
  throw new Error("stale graph must require both snapshot and Dry Web regeneration");
}

const current = createDryWebGraphViewPresentation({ graph, current: true, running: false, stale: false });
if (current.state !== "current" || current.nodeCount !== 3 || current.edgeCount !== 2 || !current.buttonsEnabled) {
  throw new Error("current graph must expose exact node and edge counts");
}
if (!current.reason.includes("generator facts only")
  || !current.reason.includes("mesh・printability")
  || !current.reason.includes("Confirmed Artwork Connections")) {
  throw new Error("current graph must disclose candidate-only facts");
}

const expectedOptions = [
  ["Surface + Dry Web", "beads", "normal"],
  ["Surface半透明 + Dry Web", "beads", "ghostSkin"],
  ["Dry Webだけ", "beads", "internalOnly"],
];
if (DRY_WEB_GRAPH_VIEW_OPTIONS.length !== expectedOptions.length) {
  throw new Error("Stage 4 must expose exactly three graph view actions");
}
for (let index = 0; index < expectedOptions.length; index++) {
  const option = DRY_WEB_GRAPH_VIEW_OPTIONS[index];
  const expected = expectedOptions[index];
  if (option.label !== expected[0] || option.viewMode !== expected[1] || option.observationMode !== expected[2]) {
    throw new Error(`unexpected graph view mapping at ${index}`);
  }
}

if (JSON.stringify(graph) !== before) throw new Error("presentation must not mutate the source graph");

for (const viewMode of ["raymarch", "beads", "mesh"] as const) {
  for (const internalObservationMode of ["normal", "ghostSkin", "internalOnly"] as const) {
    const state = { viewMode, internalObservationMode };
    const stateBefore = JSON.stringify(state);
    const preserved = preserveDryWebGraphViewState(state);
    if (preserved.viewMode !== viewMode || preserved.internalObservationMode !== internalObservationMode) {
      throw new Error(`contact refresh changed state for ${viewMode}/${internalObservationMode}`);
    }
    if (JSON.stringify(state) !== stateBefore) {
      throw new Error(`contact refresh mutated state for ${viewMode}/${internalObservationMode}`);
    }
  }
}

for (const viewMode of ["raymarch", "beads", "mesh"] as const) {
  for (const internalObservationMode of ["normal", "ghostSkin", "internalOnly"] as const) {
    const state = { viewMode, internalObservationMode };
    const stateBefore = JSON.stringify(state);
    const completed = preserveDryWebGraphViewForCompletion(state);
    if (completed.viewMode !== viewMode || completed.internalObservationMode !== internalObservationMode) {
      throw new Error(`exact recheck completion changed state for ${viewMode}/${internalObservationMode}`);
    }
    if (JSON.stringify(state) !== stateBefore) {
      throw new Error(`exact recheck completion mutated state for ${viewMode}/${internalObservationMode}`);
    }
  }
}
console.log("dryWebGraphViewPresentation: all assertions passed");

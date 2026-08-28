import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createArtworkGraph } from "./artworkGraph.ts";
import { assignOverhangSupportTargets, routeClassifiedSupportSites, validateOverhangAssignmentLedger } from "./overhangSupportPolicy.ts";
import { DEFAULT_SKIN_PARAMS } from "./field.ts";
import { createSurfaceGraph } from "./surfaceGraph.ts";
import { buildTargetedGridInternalStructure, type TargetedGridContactFloorFacts } from "./targetedGrid.ts";
import {
  FKEI_SCHEMA,
  captureFkei,
  decodeFkeiValue,
  encodeFkeiValue,
  parseFkei,
  parseFkeiDocument,
  serializeFkei,
} from "./fkei.ts";

const shape = {
  formatVersion: 1 as const,
  entries: [{ t: 1, op: "clearAll" as const, args: {} }],
};

const bindings = {
  shapeFingerprint: "canonical-surface-fingerprint",
  patchSetRevision: 2,
  paintRevision: 3,
};

function minimalDocument() {
  return captureFkei({ shape, bindings, completedStage: 1 });
}

function replaceJson(text: string, replace: (root: Record<string, unknown>) => void): string {
  const root = JSON.parse(text) as Record<string, unknown>;
  replace(root);
  return JSON.stringify(root);
}

// Strict document envelope and deterministic JSON.
const document = minimalDocument();
assert.equal(document.schema, FKEI_SCHEMA);
assert.equal(document.printApproval, false);
const serialized = serializeFkei(document);
const restored = parseFkeiDocument(serialized);
assert.deepEqual(restored.shape, document.shape);
assert.deepEqual(restored.bindings, document.bindings);
assert.equal(serializeFkei(restored), serialized);

// Legacy Shape Recipe forms remain distinguishable at the same chooser route.
assert.equal(parseFkei(JSON.stringify(shape.entries)).kind, "legacy");
assert.equal(parseFkei(JSON.stringify(shape)).kind, "legacy");
assert.equal(parseFkei(serialized).kind, "fkei");

// Float32 bytes survive exactly (including signed zero); non-finite values do not.
const source = new Float32Array([0, -0, 1.25, -9.5]);
const encoded = encodeFkeiValue(source);
const decoded = decodeFkeiValue(encoded);
assert.ok(decoded instanceof Float32Array);
assert.deepEqual(Array.from(decoded as Float32Array), Array.from(source));
const sourceBits = new Uint32Array(source.buffer.slice(0));
const decodedBits = new Uint32Array((decoded as Float32Array).buffer.slice(0));
assert.deepEqual(Array.from(decodedBits), Array.from(sourceBits));
assert.throws(() => encodeFkeiValue(new Float32Array([Number.NaN])), /non-finite/);
assert.throws(() => encodeFkeiValue(new Float32Array([Number.POSITIVE_INFINITY])), /non-finite/);
assert.throws(() => encodeFkeiValue(Number.NaN), /finite/);

// Nested typed values are cloned; capture/parse never aliases the source.
const nested = {
  values: new Float32Array([2, 4, 8]),
  child: { values: new Uint16Array([3, 5]) },
};
const nestedEncoded = encodeFkeiValue(nested);
const nestedDecoded = decodeFkeiValue(nestedEncoded) as typeof nested;
assert.deepEqual(Array.from(nestedDecoded.values), [2, 4, 8]);
assert.deepEqual(Array.from(nestedDecoded.child.values), [3, 5]);
(nestedDecoded.values as Float32Array)[0] = 99;
assert.equal(nested.values[0], 2);

// The whole candidate is rejected before it can be treated as a project.
assert.throws(() => parseFkeiDocument(replaceJson(serialized, (root) => { root.printApproval = true; })), /printApproval/);
assert.throws(() => parseFkeiDocument(replaceJson(serialized, (root) => {
  (root.shape as Record<string, unknown>).$fkei = "unknown-tag";
})), /Unknown FKEI tag/);
assert.throws(() => parseFkeiDocument(replaceJson(serialized, (root) => {
  root.shape = { $fkei: "typed-array", name: "Float32Array", length: 2, byteLength: 8, base64: "AAAAAA==" };
})), /length/);
assert.throws(() => parseFkeiDocument(replaceJson(serialized, (root) => { root.unknown = true; })), /Unknown FKEI document field/);
assert.throws(() => parseFkei("{}"), /認識できない/);

// Shape history keeps the live object-valued PatchEditIntent contract; replay
// is deliberately not consulted during validation.
const validEditEntry = {
  t: 2,
  op: "editPatch",
  args: {
    patch: { id: 7, points: [{ x: 0, y: 0, z: 0, r: 1 }] },
    intent: { kind: "scale", factor: 1 },
  },
};
const parsedEdit = parseFkei(JSON.stringify([validEditEntry]));
assert.equal(parsedEdit.kind, "legacy");
if (parsedEdit.kind === "legacy" && parsedEdit.entries[0].op === "editPatch") {
  const parsedIntent = (parsedEdit.entries[0].args as { intent: unknown }).intent as Record<string, unknown>;
  assert.deepEqual({ ...parsedIntent }, validEditEntry.args.intent);
}
assert.throws(() => parseFkei(JSON.stringify([{ ...validEditEntry, args: { ...validEditEntry.args, intent: "scale" } }])), /editPatch.intent/);
assert.equal(/\breplay\b/.test(readFileSync(new URL("./fkei.ts", import.meta.url).pathname, "utf8")), false);

// Current SkinParams values are key-typed: numeric, boolean, and closed enum
// families are all exercised, including the complete preset payload.
const validSkinParamValues: Array<[string, number | string | boolean]> = [
  ["thickness", 0.2], ["flowerShowCore", false], ["patchShape", "flower"],
  ["motifPlacement", "inside"], ["surfaceGenerationMode", "quadFlow"],
  ["quadTilingMode", "varied"], ["quadConnectionMode", "local"],
  ["contactReinforcementMode", "wholeMotif"], ["flowerMotifPreset", "custom"],
  ["flowerConnectionMode", "direct"], ["laceMotifPlacement", "center"],
  ["internalStructure", "targetedGrid"], ["seed", "author-seed"], ["flowerPetalCount", 8],
];
for (const [key, value] of validSkinParamValues) {
  const parsed = parseFkei(JSON.stringify([{ t: 1, op: "setSkinParam", args: { key, value } }]));
  assert.equal(parsed.kind, "legacy");
}
for (const [key, value] of [["thickness", true], ["patchShape", "not-a-shape"], ["internalStructure", "not-a-structure"]] as const) {
  assert.throws(() => parseFkei(JSON.stringify([{ t: 1, op: "setSkinParam", args: { key, value } }])), /setSkinParam/);
}
const validPresetEntry = {
  t: 1,
  op: "applySurfacePreset",
  args: { presetId: "dense-flower-v6-style", params: { ...DEFAULT_SKIN_PARAMS }, patches: [] },
};
assert.equal(parseFkei(JSON.stringify([validPresetEntry])).kind, "legacy");
assert.throws(() => parseFkei(JSON.stringify([{ ...validPresetEntry, args: { ...validPresetEntry.args, params: { ...DEFAULT_SKIN_PARAMS, internalStructure: undefined } } }])), /applySurfacePreset.params/);

// A real policy result exercises the production path that emits own
// undefined optional entry fields (JSON-compatible capture omits them).
const generatedPolicy = assignOverhangSupportTargets({
  explicitTargets: [{ xMm: 5, yMm: 5, zMm: 1 }],
  supportSurfacePositionsMm: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
});
assert.equal(generatedPolicy.entries.length, 1);
assert.equal(generatedPolicy.entries[0].classification, "outside");
assert.equal(Object.prototype.hasOwnProperty.call(generatedPolicy.entries[0], "normal"), true);
assert.equal(generatedPolicy.entries[0].normal, undefined);
assert.deepEqual(validateOverhangAssignmentLedger(generatedPolicy), generatedPolicy.counts);
const policyEntrySnapshot = { ...generatedPolicy.entries[0], positionMm: generatedPolicy.entries[0].positionMm && { ...generatedPolicy.entries[0].positionMm } };
const policyRaySnapshot = generatedPolicy.rayFacts && { ...generatedPolicy.rayFacts };
const policySurfaceBinding = {
  surfaceFingerprint: "canonical-surface-fingerprint",
  resolution: 8,
  targetLongestMm: 1,
  angleThresholdDeg: 45,
  cacheKeys: null,
};
const generatedDiagnosis = {
  type: "result" as const,
  generation: 1,
  metrics: {
    thresholdDeg: 45,
    surfaceArea: 1,
    dangerousAreaBefore: 0,
    dangerousAreaAfter: 0,
    mitigatedArea: 0,
    dangerousFaceCountBefore: 0,
    dangerousFaceCountAfter: 0,
    mitigatedFaceCount: 0,
    contactTolerance: 0.001,
  },
  basePositions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  baseNormals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  baseFaceCount: 1,
  resolution: 8,
  internalEdgeCount: 0,
  motifLowestPoints: [],
  beforeDangerPositions: new Float32Array(0),
  afterDangerPositions: new Float32Array(0),
  mitigatedPositions: new Float32Array(0),
  elapsedMs: 0,
};
const surfaceCheckpoint = captureFkei({
  shape,
  bindings: { ...bindings, surface: policySurfaceBinding },
  completedStage: 5,
  surface: {
    diagnosis: generatedDiagnosis,
    automaticSupportResult: generatedPolicy,
    effectiveSupportResult: generatedPolicy,
    binding: policySurfaceBinding,
  },
});
for (const key of ["inside", "outside", "unresolved", "mixedFace", "duplicate"] as const) {
  const tamperedPolicy = {
    ...generatedPolicy,
    counts: { ...generatedPolicy.counts, [key]: generatedPolicy.counts[key] + 1 },
  };
  assert.throws(() => captureFkei({
    shape,
    bindings: { ...bindings, surface: policySurfaceBinding },
    completedStage: 5,
    surface: { diagnosis: generatedDiagnosis, automaticSupportResult: tamperedPolicy, effectiveSupportResult: generatedPolicy, binding: policySurfaceBinding },
  }), /counts/);
}
assert.throws(() => captureFkei({
  shape,
  bindings: { ...bindings, surface: policySurfaceBinding },
  completedStage: 5,
  surface: { diagnosis: { ...generatedDiagnosis, resolution: 9 }, automaticSupportResult: generatedPolicy, effectiveSupportResult: generatedPolicy, binding: policySurfaceBinding },
}), /resolution/);
assert.throws(() => captureFkei({
  shape,
  bindings: { ...bindings, surface: policySurfaceBinding },
  completedStage: 5,
  surface: { diagnosis: { ...generatedDiagnosis, metrics: { ...generatedDiagnosis.metrics, thresholdDeg: 44 } }, automaticSupportResult: generatedPolicy, effectiveSupportResult: generatedPolicy, binding: policySurfaceBinding },
}), /threshold/);
const restoredSurface = parseFkeiDocument(serializeFkei(surfaceCheckpoint)).surface!;
assert.deepEqual(validateOverhangAssignmentLedger(restoredSurface.automaticSupportResult), generatedPolicy.counts);
assert.deepEqual({ ...restoredSurface.automaticSupportResult.counts }, generatedPolicy.counts);
assert.notEqual(restoredSurface.automaticSupportResult, generatedPolicy);
assert.notEqual(restoredSurface.automaticSupportResult.entries, generatedPolicy.entries);
assert.deepEqual(generatedPolicy.entries[0], policyEntrySnapshot);
assert.deepEqual({ ...restoredSurface.automaticSupportResult.rayFacts! }, policyRaySnapshot);
restoredSurface.automaticSupportResult.entries[0].positionMm!.xMm = 99;
assert.equal(generatedPolicy.entries[0].positionMm!.xMm, 5);

// A current Dry Web preview keeps the Stage 3 artwork boundary and graph
// facts together.  The exact post-attachment diagnosis is accepted only as a
// pair and is tied back to the same Surface diagnosis buffers/generation.
const artworkPatch = { id: 1, shape: "coin" as const, points: [{ x: 0, y: 0, z: 0, r: 0.5 }] };
const artworkSurface = createSurfaceGraph([artworkPatch], bindings.patchSetRevision, { revision: bindings.patchSetRevision });
const artworkSnapshot = createArtworkGraph(artworkSurface, { revision: bindings.patchSetRevision });
const graph = {
  kind: "targetedGrid" as const,
  nodes: [],
  edges: [],
  stats: {
    inputPoints: 0, delaunayTetrahedra: 0, candidateEdges: 0, clippedEdges: 0,
    removedShortEdges: 0, removedOutsideEdges: 0, removedIsolatedEdges: 0,
    requestedTargets: 0, connectedTargets: 0, gridNodeCount: 0, gridEdgeCount: 0,
    dryWebContactFacts: { usefulPatchCount: 0, componentCount: 0, mainComponentKey: null, mainComponentSize: 0, patches: [] },
  },
};
const dryWebBinding = {
  surfaceFingerprint: policySurfaceBinding.surfaceFingerprint,
  resolution: policySurfaceBinding.resolution,
  paintRevision: bindings.paintRevision,
  artworkGraphSourceKey: "artwork-source-v1",
  targetSourceResolution: policySurfaceBinding.resolution,
};
const dryWebInput = {
  preview: {
    surfaceFingerprint: dryWebBinding.surfaceFingerprint,
    resolution: dryWebBinding.resolution,
    paintRevision: dryWebBinding.paintRevision,
    artworkGraphSnapshot: artworkSnapshot,
    artworkGraphSourceKey: dryWebBinding.artworkGraphSourceKey,
    graph,
    targetConnectionFacts: [],
    contactFloorFacts: { requiredContacts: 0, mainComponentKey: null, patches: [] },
    facts: { automaticDryWebCount: 0, blueAddedCount: 0, orangeExcludedCount: 0, finalDryWebCount: 0 },
    computeMs: 1,
  },
  targetSource: { surfaceFingerprint: dryWebBinding.surfaceFingerprint, resolution: dryWebBinding.resolution, targets: [] },
  exactDiagnosis: generatedDiagnosis,
  exactBinding: policySurfaceBinding,
};
const dryDocument = captureFkei({
  shape,
  bindings: {
    ...bindings,
    surface: policySurfaceBinding,
    artworkGraph: { sourceKey: dryWebBinding.artworkGraphSourceKey, patchSetRevision: bindings.patchSetRevision },
    dryWeb: dryWebBinding,
  },
  completedStage: 7,
  artworkGraph: { snapshot: artworkSnapshot, sourceKey: dryWebBinding.artworkGraphSourceKey },
  surface: { diagnosis: generatedDiagnosis, automaticSupportResult: generatedPolicy, effectiveSupportResult: generatedPolicy, binding: policySurfaceBinding },
  dryWeb: dryWebInput,
});
const restoredDryDocument = parseFkeiDocument(serializeFkei(dryDocument));
assert.ok(restoredDryDocument.dryWeb?.preview.artworkGraphSnapshot);
assert.equal(restoredDryDocument.dryWeb?.preview.graph.kind, "targetedGrid");
assert.deepEqual({ ...restoredDryDocument.dryWeb!.preview.facts! }, dryWebInput.preview.facts);
assert.deepEqual(restoredDryDocument.dryWeb?.exactDiagnosis?.basePositions, generatedDiagnosis.basePositions);
assert.notEqual(restoredDryDocument.dryWeb?.preview.graph, graph);
assert.notEqual(restoredDryDocument.dryWeb?.preview.artworkGraphSnapshot, artworkSnapshot);
assert.deepEqual(dryWebInput.preview.graph, graph);
assert.throws(() => captureFkei({
  ...dryDocument,
  dryWeb: { ...dryWebInput, exactBinding: undefined },
}), /must be provided together/);
assert.throws(() => captureFkei({
  ...dryDocument,
  bindings: { ...dryDocument.bindings, dryWeb: { ...dryWebBinding, paintRevision: 4 } },
}), /binding/);

// Stage 7 adoption deliberately invalidates the old generator facts.  Null is
// retained only with the current canonical-adoption identity record.
const supportSettingsKey = JSON.stringify({
  supportMode: "branching", objectLiftMm: 1.2, tipRadiusMm: 0.35,
  trunkMinimumRadiusMm: 0.7, loadWidening: 0.08, maximumUnsupportedLengthMm: 12,
  branchAngleDeg: 40, baseVolumeVerticalSupports: false,
  dryWebMinimumDiameterMm: 1.6, dryWebMaximumUnreinforcedLengthMm: 12,
});
const adoptionDocument = captureFkei({
  ...dryDocument,
  dryWeb: {
    ...dryWebInput,
    exactDiagnosis: undefined,
    exactBinding: undefined,
    preview: {
      ...dryWebInput.preview,
      facts: null,
      targetConnectionFacts: null,
      contactFloorFacts: null,
      canonicalAdoption: {
        surfaceFingerprint: dryWebBinding.surfaceFingerprint,
        resolution: dryWebBinding.resolution,
        paintRevision: dryWebBinding.paintRevision,
        artworkGraphSourceKey: dryWebBinding.artworkGraphSourceKey,
        mode: "plate" as const,
        supportSettingsKey,
        targetConnectionFacts: [],
        exactValidated: false,
      },
    },
  },
});
assert.equal(parseFkeiDocument(serializeFkei(adoptionDocument)).dryWeb?.preview.facts, null);
assert.throws(() => captureFkei({
  ...adoptionDocument,
  dryWeb: { ...adoptionDocument.dryWeb!, preview: { ...adoptionDocument.dryWeb!.preview, canonicalAdoption: undefined } },
}), /canonical adoption/);
assert.throws(() => captureFkei({
  ...dryDocument,
  dryWeb: {
    ...dryWebInput,
    exactDiagnosis: undefined,
    exactBinding: undefined,
    preview: { ...dryWebInput.preview, facts: null, targetConnectionFacts: null, contactFloorFacts: null, canonicalAdoption: undefined },
  },
}), /facts/);

// A non-empty graph and multiple effective support assignments exercise the
// current Stage 4/7 derivations rather than only the empty-adoption boundary.
const multiEffectivePolicy = routeClassifiedSupportSites({
  sites: [
    { id: "explicit-profile:0", source: "explicit-profile", sourceIndex: 0, siteIndex: 0, classification: "inside", positionMm: { xMm: 0, yMm: 0, zMm: 1 }, patchId: 1 },
    { id: "explicit-profile:1", source: "explicit-profile", sourceIndex: 1, siteIndex: 0, classification: "inside", positionMm: { xMm: 0.3, yMm: 0, zMm: 1 }, patchId: 2 },
  ],
  deduplicationToleranceMm: 0.001,
});
assert.equal(multiEffectivePolicy.insideTargets.length, 2);
const multiTargets = multiEffectivePolicy.insideTargets.map((target) => ({
  ...target,
  position: { ...target.position },
}));
const multiGraphFacts: Array<{ sourceTargetIndex: number; contactNodeId: number | null; materialNodeId: number | null; edgeId: number | null; status: "connected" | "unresolved" }> = [];
const multiGraph = buildTargetedGridInternalStructure(
  [{ id: 1, x: 0, y: 0, z: 0, r: 5 }],
  0,
  [
    { id: 1, shape: "coin", points: [{ x: 0, y: 0, z: 1, r: 0.5 }] },
    { id: 2, shape: "coin", points: [{ x: 0.3, y: 0, z: 1, r: 0.5 }] },
  ],
  multiTargets,
  0,
  0.06,
  { targetSourceIndices: [0, 1], onTargetConnectionFacts: (facts) => { multiGraphFacts.splice(0, multiGraphFacts.length, ...facts); } },
);
assert.ok(multiGraph.nodes.length > 0 && multiGraph.edges.length > 0);
assert.equal(multiGraph.stats.gridNodeCount, multiGraph.nodes.length);
assert.equal(multiGraph.stats.gridEdgeCount, multiGraph.edges.length);
assert.equal(multiGraph.stats.requestedTargets, multiTargets.length);
assert.equal(multiGraphFacts.length, multiTargets.length);
const multiBefore = new Float32Array([
  0, 0, 0, 1, 0, 0, 0, 1, 0,
  0, 0, 1, 1, 0, 1, 0, 1, 1,
]);
const multiAfter = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1]);
const multiMitigated = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const multiDiagnosis = {
  ...generatedDiagnosis,
  generation: 2,
  metrics: {
    ...generatedDiagnosis.metrics,
    dangerousAreaBefore: 2,
    dangerousAreaAfter: 1,
    mitigatedArea: 1,
    dangerousFaceCountBefore: 2,
    dangerousFaceCountAfter: 1,
    mitigatedFaceCount: 1,
  },
  basePositions: multiBefore,
  baseNormals: new Float32Array(multiBefore.length).fill(0).map((_value, index) => index % 3 === 2 ? 1 : 0),
  baseFaceCount: 2,
  internalEdgeCount: multiGraph.edges.length,
  beforeDangerPositions: multiBefore,
  afterDangerPositions: multiAfter,
  mitigatedPositions: multiMitigated,
};
const multiArtworkSurface = createSurfaceGraph([
  { id: 1, shape: "coin" as const, points: [{ x: 0, y: 0, z: 1, r: 0.5 }] },
  { id: 2, shape: "coin" as const, points: [{ x: 0.3, y: 0, z: 1, r: 0.5 }] },
], bindings.patchSetRevision, { revision: bindings.patchSetRevision });
const multiArtworkSnapshot = createArtworkGraph(multiArtworkSurface, { revision: bindings.patchSetRevision });
const multiArtworkSourceKey = "artwork-source-multi-v1";
const multiDryBinding = { ...dryWebBinding, artworkGraphSourceKey: multiArtworkSourceKey };
const multiDryDocument = captureFkei({
  shape,
  bindings: {
    ...bindings,
    surface: policySurfaceBinding,
    artworkGraph: { sourceKey: multiArtworkSourceKey, patchSetRevision: bindings.patchSetRevision },
    dryWeb: multiDryBinding,
  },
  completedStage: 7,
  artworkGraph: { snapshot: multiArtworkSnapshot, sourceKey: multiArtworkSourceKey },
  surface: { diagnosis: multiDiagnosis, automaticSupportResult: multiEffectivePolicy, effectiveSupportResult: multiEffectivePolicy, binding: policySurfaceBinding },
  dryWeb: {
    preview: {
      surfaceFingerprint: multiDryBinding.surfaceFingerprint,
      resolution: multiDryBinding.resolution,
      paintRevision: multiDryBinding.paintRevision,
      artworkGraphSnapshot: multiArtworkSnapshot,
      artworkGraphSourceKey: multiArtworkSourceKey,
      graph: multiGraph,
      targetConnectionFacts: multiGraphFacts,
      contactFloorFacts: { requiredContacts: 0, mainComponentKey: null, patches: [] },
      facts: { automaticDryWebCount: 2, blueAddedCount: 0, orangeExcludedCount: 0, finalDryWebCount: 2 },
      computeMs: 2,
    },
    targetSource: { surfaceFingerprint: multiDryBinding.surfaceFingerprint, resolution: multiDryBinding.resolution, targets: multiTargets },
    exactDiagnosis: multiDiagnosis,
    exactBinding: policySurfaceBinding,
  },
});
const restoredMulti = parseFkeiDocument(serializeFkei(multiDryDocument));
assert.equal(restoredMulti.dryWeb?.preview.graph.nodes.length, multiGraph.nodes.length);
assert.equal(restoredMulti.dryWeb?.preview.graph.edges.length, multiGraph.edges.length);
assert.equal(restoredMulti.dryWeb?.targetSource.targets.length, 2);
assert.equal(restoredMulti.surface?.diagnosis.metrics.dangerousFaceCountBefore, 2);
assert.equal(restoredMulti.surface?.diagnosis.metrics.dangerousFaceCountAfter, 1);
assert.equal(restoredMulti.surface?.diagnosis.metrics.mitigatedFaceCount, 1);
assert.equal(restoredMulti.dryWeb?.exactDiagnosis?.internalEdgeCount, multiGraph.edges.length);
assert.notEqual(restoredMulti.dryWeb?.preview.graph.nodes, multiGraph.nodes);
assert.deepEqual(multiGraph.stats.gridNodeCount, multiGraph.nodes.length);

// targetedGrid.ts deliberately reports a component-clamped count: with two
// disconnected patch components, two connected target facts yield only one
// `connectedTargets` because the largest component has size one.  A validator
// that equates the statistic with the fact-array length would reject this
// valid runtime result.
const multiComponentPolicy = routeClassifiedSupportSites({
  sites: [
    { id: "explicit-profile:0", source: "explicit-profile", sourceIndex: 0, siteIndex: 0, classification: "inside", positionMm: { xMm: 0, yMm: 0, zMm: 1 }, patchId: 1 },
    { id: "explicit-profile:1", source: "explicit-profile", sourceIndex: 1, siteIndex: 0, classification: "inside", positionMm: { xMm: 2, yMm: 0, zMm: 1 }, patchId: 2 },
  ],
  deduplicationToleranceMm: 0.001,
});
const multiComponentTargets = multiComponentPolicy.insideTargets.map((target) => ({
  ...target,
  position: { ...target.position },
}));
const multiComponentFacts: Array<{ sourceTargetIndex: number; contactNodeId: number | null; materialNodeId: number | null; edgeId: number | null; status: "connected" | "unresolved" }> = [];
let multiComponentFloorFacts: TargetedGridContactFloorFacts | null = null;
const multiComponentGraph = buildTargetedGridInternalStructure(
  [{ id: 1, x: 0, y: 0, z: 0, r: 5 }],
  0,
  [
    { id: 1, shape: "coin", points: [{ x: 0, y: 0, z: 1, r: 0.5 }] },
    { id: 2, shape: "coin", points: [{ x: 2, y: 0, z: 1, r: 0.5 }] },
  ],
  multiComponentTargets,
  0,
  0.06,
  {
    targetSourceIndices: [0, 1],
    onTargetConnectionFacts: (facts) => { multiComponentFacts.splice(0, multiComponentFacts.length, ...facts); },
    onContactFloorFacts: (facts) => { multiComponentFloorFacts = facts; },
  },
);
assert.equal(multiComponentGraph.stats.dryWebContactFacts?.componentCount, 2);
assert.equal(multiComponentGraph.stats.connectedTargets, 1);
assert.equal(multiComponentFacts.filter((fact) => fact.status === "connected").length, 2);
assert.ok(multiComponentFloorFacts);
const multiComponentArtworkSurface = createSurfaceGraph([
  { id: 1, shape: "coin" as const, points: [{ x: 0, y: 0, z: 1, r: 0.5 }] },
  { id: 2, shape: "coin" as const, points: [{ x: 2, y: 0, z: 1, r: 0.5 }] },
], bindings.patchSetRevision, { revision: bindings.patchSetRevision });
const multiComponentArtworkSnapshot = createArtworkGraph(multiComponentArtworkSurface, { revision: bindings.patchSetRevision });
const multiComponentArtworkSourceKey = "artwork-source-multi-component-v1";
const multiComponentDryBinding = { ...dryWebBinding, artworkGraphSourceKey: multiComponentArtworkSourceKey };
const multiComponentDiagnosis = { ...multiDiagnosis, internalEdgeCount: multiComponentGraph.edges.length };
const multiComponentDocument = captureFkei({
  shape,
  bindings: {
    ...bindings,
    surface: policySurfaceBinding,
    artworkGraph: { sourceKey: multiComponentArtworkSourceKey, patchSetRevision: bindings.patchSetRevision },
    dryWeb: multiComponentDryBinding,
  },
  completedStage: 7,
  artworkGraph: { snapshot: multiComponentArtworkSnapshot, sourceKey: multiComponentArtworkSourceKey },
  surface: { diagnosis: multiComponentDiagnosis, automaticSupportResult: multiComponentPolicy, effectiveSupportResult: multiComponentPolicy, binding: policySurfaceBinding },
  dryWeb: {
    preview: {
      surfaceFingerprint: multiComponentDryBinding.surfaceFingerprint,
      resolution: multiComponentDryBinding.resolution,
      paintRevision: multiComponentDryBinding.paintRevision,
      artworkGraphSnapshot: multiComponentArtworkSnapshot,
      artworkGraphSourceKey: multiComponentArtworkSourceKey,
      graph: multiComponentGraph,
      targetConnectionFacts: multiComponentFacts,
      contactFloorFacts: multiComponentFloorFacts,
      facts: { automaticDryWebCount: 2, blueAddedCount: 0, orangeExcludedCount: 0, finalDryWebCount: 2 },
      computeMs: 2,
    },
    targetSource: { surfaceFingerprint: multiComponentDryBinding.surfaceFingerprint, resolution: multiComponentDryBinding.resolution, targets: multiComponentTargets },
    exactDiagnosis: multiComponentDiagnosis,
    exactBinding: policySurfaceBinding,
  },
});
const restoredMultiComponent = parseFkeiDocument(serializeFkei(multiComponentDocument));
assert.equal(restoredMultiComponent.dryWeb?.preview.graph.stats.connectedTargets, 1);
assert.equal(restoredMultiComponent.dryWeb?.preview.targetConnectionFacts?.filter((fact) => fact.status === "connected").length, 2);
assert.equal(restoredMultiComponent.dryWeb?.preview.graph.stats.dryWebContactFacts?.componentCount, 2);
for (const delta of [-1, 1]) {
  assert.throws(() => captureFkei({
    ...multiComponentDocument,
    dryWeb: {
      ...multiComponentDocument.dryWeb!,
      preview: {
        ...multiComponentDocument.dryWeb!.preview,
        graph: { ...multiComponentGraph, stats: { ...multiComponentGraph.stats, connectedTargets: 1 + delta } },
      },
    },
  }), /connectedTargets/);
}

// Canonical adoption has intentionally dropped the live preview's copy of
// per-target facts.  The persisted lossless clone retains the pre-adoption
// runtime evidence so the same component-clamped derivation remains fail-closed.
const multiComponentAdoption = captureFkei({
  ...multiComponentDocument,
  dryWeb: {
    ...multiComponentDocument.dryWeb!,
    exactDiagnosis: undefined,
    exactBinding: undefined,
    preview: {
      ...multiComponentDocument.dryWeb!.preview,
      facts: null,
      targetConnectionFacts: null,
      contactFloorFacts: null,
      canonicalAdoption: {
        surfaceFingerprint: multiComponentDryBinding.surfaceFingerprint,
        resolution: multiComponentDryBinding.resolution,
        paintRevision: multiComponentDryBinding.paintRevision,
        artworkGraphSourceKey: multiComponentArtworkSourceKey,
        mode: "plate" as const,
        supportSettingsKey,
        targetConnectionFacts: multiComponentFacts,
        exactValidated: false,
      },
    },
  },
});
assert.equal(parseFkeiDocument(serializeFkei(multiComponentAdoption)).dryWeb?.preview.graph.stats.connectedTargets, 1);
const restoredMultiComponentAdoption = parseFkeiDocument(serializeFkei(multiComponentAdoption));
assert.equal(restoredMultiComponentAdoption.dryWeb?.preview.canonicalAdoption?.targetConnectionFacts.length, 2);
assert.equal(restoredMultiComponentAdoption.dryWeb?.preview.canonicalAdoption?.targetConnectionFacts.filter((fact) => fact.status === "connected").length, 2);
assert.notEqual(restoredMultiComponentAdoption.dryWeb?.preview.canonicalAdoption?.targetConnectionFacts, multiComponentFacts);
for (const delta of [-1, 1]) {
  assert.throws(() => captureFkei({
    ...multiComponentAdoption,
    dryWeb: {
      ...multiComponentAdoption.dryWeb!,
      preview: {
        ...multiComponentAdoption.dryWeb!.preview,
        graph: { ...multiComponentGraph, stats: { ...multiComponentGraph.stats, connectedTargets: 1 + delta } },
      },
    },
  }), /connectedTargets/);
}

// Every target fact is provenance, not a free-form status/count.  Check both
// nullability branches, edge endpoint identity, and complete source coverage.
const activeTargetFacts = multiComponentDocument.dryWeb!.preview.targetConnectionFacts!;
assert.throws(() => captureFkei({
  ...multiComponentDocument,
  dryWeb: { ...multiComponentDocument.dryWeb!, preview: { ...multiComponentDocument.dryWeb!.preview, targetConnectionFacts: [{ ...activeTargetFacts[0], edgeId: null }, activeTargetFacts[1]] } },
}), /connected fact must have all graph references/);
assert.throws(() => captureFkei({
  ...multiComponentDocument,
  dryWeb: { ...multiComponentDocument.dryWeb!, preview: { ...multiComponentDocument.dryWeb!.preview, targetConnectionFacts: [{ ...activeTargetFacts[0], edgeId: multiComponentGraph.edges[1].id }, activeTargetFacts[1]] } },
}), /edge does not connect/);
assert.throws(() => captureFkei({
  ...multiComponentDocument,
  dryWeb: { ...multiComponentDocument.dryWeb!, preview: { ...multiComponentDocument.dryWeb!.preview, targetConnectionFacts: [{ ...activeTargetFacts[0], status: "unresolved" as const }, activeTargetFacts[1]] } },
}), /unresolved fact must have null/);
assert.throws(() => captureFkei({
  ...multiComponentDocument,
  dryWeb: { ...multiComponentDocument.dryWeb!, preview: { ...multiComponentDocument.dryWeb!.preview, targetConnectionFacts: [activeTargetFacts[0], { ...activeTargetFacts[1], sourceTargetIndex: activeTargetFacts[0].sourceTargetIndex }] } },
}), /duplicate sourceTargetIndex/);
assert.throws(() => captureFkei({
  ...multiComponentDocument,
  dryWeb: { ...multiComponentDocument.dryWeb!, preview: { ...multiComponentDocument.dryWeb!.preview, targetConnectionFacts: [activeTargetFacts[0], { ...activeTargetFacts[1], sourceTargetIndex: 9 }] } },
}), /sourceTargetIndex is out of range/);
assert.throws(() => captureFkei({
  ...multiComponentAdoption,
  dryWeb: { ...multiComponentAdoption.dryWeb!, preview: { ...multiComponentAdoption.dryWeb!.preview, canonicalAdoption: { ...multiComponentAdoption.dryWeb!.preview.canonicalAdoption!, targetConnectionFacts: [{ ...activeTargetFacts[0], edgeId: null }, activeTargetFacts[1]] } } },
}), /connected fact must have all graph references/);

const componentFacts = multiComponentGraph.stats.dryWebContactFacts!;
const relabelledFacts = {
  ...componentFacts,
  componentCount: 1,
  mainComponentKey: "1,2",
  mainComponentSize: 2,
  patches: componentFacts.patches.map((patch) => ({ ...patch, componentKey: "1,2", componentSize: 2 })),
};
assert.throws(() => captureFkei({
  ...multiComponentDocument,
  dryWeb: { ...multiComponentDocument.dryWeb!, preview: { ...multiComponentDocument.dryWeb!.preview, graph: { ...multiComponentGraph, stats: { ...multiComponentGraph.stats, dryWebContactFacts: relabelledFacts } } } },
}), /patch component spans graph components|merges distinct patch components/);
// A target-only edge must not be allowed to bridge the two patch components
// and make a forged single-component ledger look self-consistent.  The
// claimed target endpoint is updated to the bridge endpoint as well, so the
// target-fact validator alone cannot reject it; the patch-only DSU must.
const forgedBridgeFacts = [
  { ...multiComponentFacts[0], materialNodeId: multiComponentGraph.nodes[2].id },
  multiComponentFacts[1],
];
const forgedBridgeGraph = {
  ...multiComponentGraph,
  edges: multiComponentGraph.edges.map((edge, index) => index === 0
    ? { ...edge, end: multiComponentGraph.nodes[2].id }
    : edge),
  stats: { ...multiComponentGraph.stats, connectedTargets: 2, dryWebContactFacts: relabelledFacts },
};
assert.throws(() => captureFkei({
  ...multiComponentDocument,
  dryWeb: { ...multiComponentDocument.dryWeb!, preview: { ...multiComponentDocument.dryWeb!.preview, graph: forgedBridgeGraph, targetConnectionFacts: forgedBridgeFacts } },
}), /patch component spans graph components|merges distinct patch components/);
assert.throws(() => captureFkei({
  ...multiComponentAdoption,
  dryWeb: {
    ...multiComponentAdoption.dryWeb!,
    preview: {
      ...multiComponentAdoption.dryWeb!.preview,
      graph: forgedBridgeGraph,
      canonicalAdoption: { ...multiComponentAdoption.dryWeb!.preview.canonicalAdoption!, targetConnectionFacts: forgedBridgeFacts },
    },
  },
}), /patch component spans graph components|merges distinct patch components/);
const swappedContactFacts = {
  ...componentFacts,
  patches: [
    {
      ...componentFacts.patches[0],
      contactNodeIds: [multiComponentGraph.nodes[multiComponentGraph.nodes.length - 1].id],
      contactCount: 1,
    },
    componentFacts.patches[1],
  ],
};
assert.throws(() => captureFkei({
  ...multiComponentDocument,
  dryWeb: { ...multiComponentDocument.dryWeb!, preview: { ...multiComponentDocument.dryWeb!.preview, graph: { ...multiComponentGraph, stats: { ...multiComponentGraph.stats, dryWebContactFacts: swappedContactFacts } } } },
}), /merges distinct patch components|patch component spans graph components/);
const bridgedTopologyGraph = {
  ...multiComponentGraph,
  edges: multiComponentGraph.edges.map((edge, index) => index === 0
    ? { ...edge, end: multiComponentGraph.nodes[multiComponentGraph.nodes.length - 1].id }
    : edge),
};
assert.throws(() => captureFkei({
  ...multiComponentDocument,
  dryWeb: { ...multiComponentDocument.dryWeb!, preview: { ...multiComponentDocument.dryWeb!.preview, graph: bridgedTopologyGraph } },
}), /edge does not connect|merges distinct patch components|patch component spans graph components/);
assert.throws(() => captureFkei({
  ...multiDryDocument,
  surface: { ...multiDryDocument.surface!, diagnosis: { ...multiDiagnosis, metrics: { ...multiDiagnosis.metrics, dangerousFaceCountBefore: 1 } } },
}), /face counts/);
assert.throws(() => captureFkei({
  ...multiDryDocument,
  dryWeb: { ...multiDryDocument.dryWeb!, preview: { ...multiDryDocument.dryWeb!.preview, facts: { automaticDryWebCount: 2, blueAddedCount: 1, orangeExcludedCount: 0, finalDryWebCount: 2 } } },
}), /routing facts/);
assert.throws(() => captureFkei({
  ...multiDryDocument,
  dryWeb: { ...multiDryDocument.dryWeb!, preview: { ...multiDryDocument.dryWeb!.preview, graph: { ...multiGraph, stats: { ...multiGraph.stats, gridNodeCount: multiGraph.nodes.length + 1 } } } },
}), /grid counts/);
for (const key of ["requestedTargets", "connectedTargets", "gridNodeCount", "gridEdgeCount"] as const) {
  const stats = { ...multiGraph.stats } as Record<string, unknown>;
  delete stats[key];
  assert.throws(() => captureFkei({
    ...multiDryDocument,
    dryWeb: { ...multiDryDocument.dryWeb!, preview: { ...multiDryDocument.dryWeb!.preview, graph: { ...multiGraph, stats } } },
  }), /required for targetedGrid/);
}
for (const delta of [-1, 1]) {
  assert.throws(() => captureFkei({
    ...multiDryDocument,
    dryWeb: { ...multiDryDocument.dryWeb!, preview: { ...multiDryDocument.dryWeb!.preview, graph: { ...multiGraph, stats: { ...multiGraph.stats, connectedTargets: multiGraph.stats.connectedTargets! + delta } } } },
  }), /connectedTargets/);
}
assert.throws(() => captureFkei({
  ...multiDryDocument,
  dryWeb: {
    ...multiDryDocument.dryWeb!,
    targetSource: {
      ...multiDryDocument.dryWeb!.targetSource,
      targets: [{ ...multiTargets[0], assignmentId: "tampered-assignment" }, multiTargets[1]],
    },
  },
}), /effective support ledger/);
assert.throws(() => captureFkei({
  ...adoptionDocument,
  dryWeb: { ...adoptionDocument.dryWeb!, preview: { ...adoptionDocument.dryWeb!.preview, canonicalAdoption: { ...adoptionDocument.dryWeb!.preview.canonicalAdoption!, supportSettingsKey: JSON.stringify({ supportMode: "branching", objectLiftMm: 99, tipRadiusMm: 0.35, trunkMinimumRadiusMm: 0.7, loadWidening: 0.08, maximumUnsupportedLengthMm: 12, branchAngleDeg: 40, baseVolumeVerticalSupports: false, dryWebMinimumDiameterMm: 1.6, dryWebMaximumUnreinforcedLengthMm: 12 }) } } },
}), /runtime control range/);
assert.throws(() => captureFkei({
  ...adoptionDocument,
  dryWeb: { ...adoptionDocument.dryWeb!, preview: { ...adoptionDocument.dryWeb!.preview, canonicalAdoption: { ...adoptionDocument.dryWeb!.preview.canonicalAdoption!, supportSettingsKey: JSON.stringify({ objectLiftMm: 1.2, supportMode: "branching", tipRadiusMm: 0.35, trunkMinimumRadiusMm: 0.7, loadWidening: 0.08, maximumUnsupportedLengthMm: 12, branchAngleDeg: 40, baseVolumeVerticalSupports: false, dryWebMinimumDiameterMm: 1.6, dryWebMaximumUnreinforcedLengthMm: 12 }) } } },
}), /canonical JSON ordering/);
assert.throws(() => captureFkei({
  ...multiDryDocument,
  artworkGraph: { ...multiDryDocument.artworkGraph!, snapshot: { ...multiArtworkSnapshot, surfaceDraft: { ...multiArtworkSnapshot.surfaceDraft, patchSetRevision: bindings.patchSetRevision + 1 } } },
}), /patchSetRevision/);

console.log("fkei tests passed: strict schema, legacy discrimination, lossless typed buffers, atomic rejection, edit intent, generated policy, Dry Web exact/adoption round-trips");

import assert from "node:assert/strict";
import {
  addSurfaceRelation,
  adaptPatchToSurfaceNode,
  confirmSurfaceRelation,
  confirmedSurfaceComponents,
  createSurfaceGraph,
  createSurfaceRelationEdge,
  fingerprintSurfaceGraph,
  parseSurfaceGraph,
  proposeSurfaceRelation,
  rejectSurfaceRelation,
  serializeSurfaceGraph,
  validateSurfaceGraph,
} from "./surfaceGraph.ts";
import type { Patch } from "./field.ts";

function makePatch(id: number, offset = id): Patch {
  return {
    id,
    shape: "coin",
    points: [{ x: offset, y: offset + 0.1, z: offset + 0.2, r: 0.4 }],
  };
}

const patch = makePatch(7);
const patchBefore = JSON.stringify(patch);
const nodeAtRevision = adaptPatchToSurfaceNode(patch, 3);
assert.equal(JSON.stringify(patch), patchBefore);
const editedPatch = { ...patch, points: [{ ...patch.points[0], x: 9.5 }] };
const editedNodeSameRevision = adaptPatchToSurfaceNode(editedPatch, 3);
const nodeAtNewRevision = adaptPatchToSurfaceNode(patch, 4);
assert.equal(editedNodeSameRevision.authorElementId, nodeAtRevision.authorElementId);
assert.deepEqual(editedNodeSameRevision.patch, editedPatch);
assert.notEqual(nodeAtNewRevision.authorElementId, nodeAtRevision.authorElementId);
assert.deepEqual(nodeAtRevision.patchInstanceId, { patchSetRevision: 3, patchId: 7 });
assert.notEqual(editedNodeSameRevision.realizationIdentity, nodeAtRevision.realizationIdentity);

const completeMotifParams = {
  irregularity: 0.5,
  coinHoleRatio: 0.2,
  flatRingHoleRatio: 0.6,
  ringNodeCount: 10,
  ringTubeR: 0.06,
  ringWobbleR: 0.3,
  ringWobblePos: 0.15,
  flowerMotifPreset: "six-core" as const,
  flowerPetalCount: 6 as const,
  flowerShowCore: true,
  flowerOpening: 0.93,
  flowerNeck: 0.36,
  flowerCoreSize: 0.57,
  flowerCupping: 0.32,
  flowerCoreLift: 0,
  flowerGrowthDifference: 0,
  flowerExpansion: 1,
};
const completePatch = {
  ...patch,
  motifPlacement: "surface" as const,
  ringDiameter: 0.4,
  quadCellId: 2,
  surfaceCellId: 3,
  surfaceCellKind: "quad" as const,
  motifParams: completeMotifParams,
  points: [{
    ...patch.points[0],
    role: "motif" as const,
    baseR: 0.2,
    fusionBaseR: 0.21,
    fusionR: 0.22,
    meshJoinR: 0.01,
    contactR: 0.02,
    contactScale: 1.1,
    ringPrimary: true,
  }],
};
assert.deepEqual(adaptPatchToSurfaceNode(completePatch, 3).patch, completePatch);
assert.throws(
  () => adaptPatchToSurfaceNode({ ...completePatch, unknownPatchFact: true } as unknown as Patch, 3),
  /not a recognized persisted Patch fact/,
);
assert.throws(
  () => adaptPatchToSurfaceNode({
    ...completePatch,
    points: [{ ...completePatch.points[0], baseR: "0.2" }],
  } as unknown as Patch, 3),
  /baseR.*finite/,
);
assert.throws(
  () => adaptPatchToSurfaceNode({
    ...completePatch,
    points: [{ ...completePatch.points[0], ringPrimary: "true" }],
  } as unknown as Patch, 3),
  /ringPrimary.*boolean/,
);
assert.throws(
  () => adaptPatchToSurfaceNode({
    ...completePatch,
    motifParams: { ...completeMotifParams, flowerShowCore: "true" },
  } as unknown as Patch, 3),
  /motifParams\.flowerShowCore.*boolean/,
);
assert.throws(
  () => adaptPatchToSurfaceNode({
    ...completePatch,
    motifParams: { ...completeMotifParams, flowerPetalCount: 13 },
  } as unknown as Patch, 3),
  /motifParams\.flowerPetalCount is invalid/,
);
assert.throws(
  () => adaptPatchToSurfaceNode({
    ...completePatch,
    motifParams: { ...completeMotifParams, unknownMotifFact: 1 },
  } as unknown as Patch, 3),
  /motifParams\.unknownMotifFact.*recognized/,
);
assert.throws(
  () => adaptPatchToSurfaceNode({
    ...completePatch,
    points: [{ ...completePatch.points[0], contactR: Number.POSITIVE_INFINITY }],
  } as unknown as Patch, 3),
  /contactR.*finite/,
);
assert.throws(
  () => adaptPatchToSurfaceNode({
    ...completePatch,
    points: [{ ...completePatch.points[0], contactScale: undefined }],
  } as unknown as Patch, 3),
  /contactScale.*omitted|contactScale.*undefined/,
);
assert.throws(
  () => adaptPatchToSurfaceNode({
    ...completePatch,
    motifParams: { ...completeMotifParams, flowerOpening: () => 1 },
  } as unknown as Patch, 3),
  /flowerOpening.*finite|JSON/,
);

const patchA = makePatch(1, 1);
const patchB = makePatch(2, 2);
const patchC = makePatch(3, 3);
const nodeA = adaptPatchToSurfaceNode(patchA, 8);
const nodeB = adaptPatchToSurfaceNode(patchB, 8);
const nodeC = adaptPatchToSurfaceNode(patchC, 8);
const proposedEdge = createSurfaceRelationEdge("surface-relation-a", nodeA.id, nodeB.id, {
  relation: "contact",
});
const proposedEdgeB = createSurfaceRelationEdge("surface-relation-b", nodeB.id, nodeC.id, {
  relation: "near",
});
assert.equal(proposedEdge.lifecycle, "candidate");
assert.equal(proposedEdge.relationState, "proposed");
assert.equal(proposedEdge.provenance.source, "generated");
assert.equal(proposedEdge.provenance.intent, "generated");
assert.throws(
  () => createSurfaceRelationEdge("surface-relation-direct-confirmed-generated", nodeA.id, nodeB.id, {
    lifecycle: "confirmed",
  }),
  /direct confirmed relations require author pinned provenance/,
);
assert.throws(
  () => createSurfaceRelationEdge("surface-relation-direct-rejected-generated", nodeA.id, nodeB.id, {
    lifecycle: "rejected",
  }),
  /direct rejected relations require author manuallyDeleted provenance/,
);
assert.throws(
  () => createSurfaceRelationEdge("surface-relation-direct-confirmed-no-history", nodeA.id, nodeB.id, {
    lifecycle: "confirmed",
    revision: 1,
    provenance: {
      source: "author",
      intent: "pinned",
      operation: "manual-confirm",
      revision: 1,
    },
  }),
  /generated provenance predecessor/,
);
const directConfirmed = createSurfaceRelationEdge("surface-relation-direct-confirmed", nodeA.id, nodeB.id, {
  lifecycle: "confirmed",
  revision: 1,
  provenance: {
    source: "author",
    intent: "pinned",
    operation: "manual-confirm",
    revision: 1,
    history: [{
      source: "generated",
      intent: "generated",
      generator: "surface-graph-adapter",
      algorithmVersion: "surface-graph-v1",
      inputFingerprint: "direct-confirmed",
      operation: "surface-relation",
      revision: 0,
    }],
  },
});
assert.equal(directConfirmed.lifecycle, "confirmed");
const directRejected = createSurfaceRelationEdge("surface-relation-direct-rejected", nodeA.id, nodeB.id, {
  lifecycle: "rejected",
  revision: 1,
  provenance: {
    source: "author",
    intent: "manuallyDeleted",
    operation: "manual-reject",
    revision: 1,
    history: [{
      source: "generated",
      intent: "generated",
      generator: "surface-graph-adapter",
      algorithmVersion: "surface-graph-v1",
      inputFingerprint: "direct-rejected",
      operation: "surface-relation",
      revision: 0,
    }],
  },
});
assert.equal(directRejected.lifecycle, "rejected");
const surface = createSurfaceGraph([patchA, patchB, patchC], 8, {
  edges: [proposedEdge, proposedEdgeB],
});
assert.equal(validateSurfaceGraph(surface).ok, true);
assert.equal(surface.id, createSurfaceGraph([patchA, patchB, patchC], 8).id);
assert.equal(surface.revision, 0);
assert.equal(surface.parentRevision, null);
assert.deepEqual(surface.lineage, [0]);
assert.equal(surface.provenance.source, "generated");
assert.equal(surface.provenance.intent, "generated");
assert.equal(surface.provenance.revision, surface.revision);
assert.equal(surface.nodes.every((node) => node.parentRevision === null), true);
assert.equal(surface.edges.every((edge) => edge.parentRevision === null), true);
assert.equal(surface.nodes.every((node) => node.provenance.source === "generated"), true);
assert.equal(surface.edges.every((edge) => edge.provenance.source === "generated"), true);

const forgedConfirmedGenerated = {
  ...surface,
  edges: surface.edges.map((edge, index) => index === 0
    ? { ...edge, lifecycle: "confirmed" as const, relationState: "confirmed" as const }
    : edge),
};
assert.equal(validateSurfaceGraph(forgedConfirmedGenerated).ok, false);
assert.throws(
  () => parseSurfaceGraph(JSON.stringify(forgedConfirmedGenerated)),
  /direct confirmed relations require author pinned provenance/,
);
const forgedRejectedGenerated = {
  ...surface,
  edges: surface.edges.map((edge, index) => index === 0
    ? { ...edge, lifecycle: "rejected" as const, relationState: "rejected" as const }
    : edge),
};
assert.equal(validateSurfaceGraph(forgedRejectedGenerated).ok, false);
assert.throws(
  () => parseSurfaceGraph(JSON.stringify(forgedRejectedGenerated)),
  /direct rejected relations require author manuallyDeleted provenance/,
);

const candidateWithConfirmedState = {
  ...surface,
  edges: surface.edges.map((edge, index) => index === 0 ? { ...edge, relationState: "confirmed" as const } : edge),
};
assert.equal(validateSurfaceGraph(candidateWithConfirmedState).ok, false);
const candidateWithoutState = {
  ...surface,
  edges: surface.edges.map((edge, index) => {
    if (index !== 0) return edge;
    const copy = { ...edge } as Record<string, unknown>;
    delete copy.relationState;
    return copy;
  }),
};
assert.equal(validateSurfaceGraph(candidateWithoutState).ok, false);
const confirmedWithProposedState = {
  ...surface,
  edges: surface.edges.map((edge, index) => index === 0
    ? { ...edge, lifecycle: "confirmed" as const, relationState: "proposed" as const }
    : edge),
};
assert.equal(validateSurfaceGraph(confirmedWithProposedState).ok, false);
const rejectedWithConfirmedState = {
  ...surface,
  edges: surface.edges.map((edge, index) => index === 0
    ? { ...edge, lifecycle: "rejected" as const, relationState: "confirmed" as const }
    : edge),
};
assert.equal(validateSurfaceGraph(rejectedWithConfirmedState).ok, false);
const rejectedWithoutState = {
  ...surface,
  edges: surface.edges.map((edge, index) => {
    if (index !== 0) return edge;
    const copy = { ...edge, lifecycle: "rejected" as const } as Record<string, unknown>;
    delete copy.relationState;
    return copy;
  }),
};
assert.equal(validateSurfaceGraph(rejectedWithoutState).ok, false);
const staleWithState = {
  ...surface,
  edges: surface.edges.map((edge, index) => index === 0
    ? { ...edge, lifecycle: "stale" as const, relationState: "proposed" as const }
    : edge),
};
assert.equal(validateSurfaceGraph(staleWithState).ok, false);
const staleWithoutState = {
  ...surface,
  edges: surface.edges.map((edge, index) => index === 0
    ? (() => {
      const copy = { ...edge, lifecycle: "stale" as const } as Record<string, unknown>;
      delete copy.relationState;
      return copy;
    })()
    : edge),
};
assert.equal(validateSurfaceGraph(staleWithoutState).ok, true);

const surfaceBeforeConfirm = JSON.stringify(surface);
const firstEdgeBeforeConfirm = JSON.stringify(surface.edges[0]);
const secondEdgeBeforeConfirm = JSON.stringify(surface.edges[1]);
const nodesBeforeConfirm = surface.nodes.map((node) => JSON.stringify(node));

const confirmed = confirmSurfaceRelation(surface, proposedEdge.id);
assert.equal(confirmed.revision, 1);
assert.equal(confirmed.parentRevision, surface.revision);
assert.deepEqual(confirmed.lineage, [0, 1]);
assert.equal(confirmed.edges[0].revision, confirmed.revision);
assert.equal(confirmed.edges[0].parentRevision, surface.edges[0].revision);
assert.equal(confirmed.edges[0].provenance.source, "author");
assert.equal(confirmed.edges[0].provenance.intent, "pinned");
assert.equal(confirmed.edges[0].provenance.history?.length, 1);
assert.equal(confirmed.edges[0].provenance.history?.[0]?.source, "generated");
assert.equal(confirmed.edges[0].provenance.history?.[0]?.revision, surface.edges[0].revision);
assert.equal(confirmed.provenance.source, "author");
assert.equal(confirmed.provenance.intent, "pinned");
assert.equal(confirmed.provenance.history?.length, 1);
assert.equal(confirmed.provenance.history?.[0]?.source, "generated");
assert.equal(JSON.stringify(surface), surfaceBeforeConfirm);
assert.equal(JSON.stringify(surface.edges[0]), firstEdgeBeforeConfirm);
assert.equal(JSON.stringify(surface.edges[1]), secondEdgeBeforeConfirm);
assert.deepEqual(surface.nodes.map((node) => JSON.stringify(node)), nodesBeforeConfirm);
assert.equal(surface.edges[0].lifecycle, "candidate");
assert.equal(confirmed.edges[0].lifecycle, "confirmed");
assert.equal(confirmed.edges[0].relationState, "confirmed");
assert.deepEqual(confirmedSurfaceComponents(confirmed), [[nodeA.id, nodeB.id], [nodeC.id]]);
const rejected = rejectSurfaceRelation(confirmed, proposedEdgeB.id);
assert.equal(rejected.revision, 2);
assert.equal(rejected.parentRevision, confirmed.revision);
assert.deepEqual(rejected.lineage, [0, 1, 2]);
assert.equal(rejected.edges[1].revision, rejected.revision);
assert.equal(rejected.edges[1].parentRevision, confirmed.edges[1].revision);
assert.equal(rejected.edges[1].provenance.source, "author");
assert.equal(rejected.edges[1].provenance.intent, "manuallyDeleted");
assert.equal(rejected.edges[1].provenance.history?.length, 1);
assert.equal(rejected.provenance.source, "author");
assert.equal(rejected.provenance.intent, "manuallyDeleted");
assert.equal(rejected.provenance.history?.length, 2);
assert.equal(rejected.edges[1].lifecycle, "rejected");
assert.deepEqual(confirmedSurfaceComponents(rejected), [[nodeA.id, nodeB.id], [nodeC.id]]);

const authorOnlyConfirmed = {
  ...confirmed,
  edges: confirmed.edges.map((edge, index) => index === 0
    ? {
      ...edge,
      provenance: {
        ...edge.provenance,
        history: [{
          source: "author" as const,
          intent: "manuallyMoved" as const,
          operation: "manual-move",
          revision: 0,
        }],
      },
    }
    : edge),
};
assert.equal(validateSurfaceGraph(authorOnlyConfirmed).ok, false);
const authorOnlyRejected = {
  ...rejected,
  edges: rejected.edges.map((edge, index) => index === 1
    ? {
      ...edge,
      provenance: {
        ...edge.provenance,
        history: [{
          source: "author" as const,
          intent: "manuallyMoved" as const,
          operation: "manual-move",
          revision: 1,
        }],
      },
    }
    : edge),
};
assert.equal(validateSurfaceGraph(authorOnlyRejected).ok, false);

const multipleHistoryGenerated = {
  source: "generated" as const,
  intent: "generated" as const,
  generator: "surface-graph-adapter",
  algorithmVersion: "surface-graph-v1",
  inputFingerprint: "multiple-history",
  operation: "surface-relation",
  revision: 0,
};
const multipleHistoryAuthorMove = {
  source: "author" as const,
  intent: "manuallyMoved" as const,
  operation: "manual-move",
  revision: 1,
};
const multipleHistoryAuthorAdd = {
  source: "author" as const,
  intent: "manuallyAdded" as const,
  operation: "manual-add",
  revision: 2,
};
const multipleHistory = [multipleHistoryGenerated, multipleHistoryAuthorMove, multipleHistoryAuthorAdd];
const multipleHistoryConfirmed = createSurfaceRelationEdge(
  "surface-relation-multiple-history-confirmed",
  nodeA.id,
  nodeB.id,
  {
    relation: "contact",
    lifecycle: "confirmed",
    revision: 3,
    parentRevision: 2,
    provenance: {
      source: "author",
      intent: "pinned",
      operation: "manual-confirm",
      revision: 3,
      history: multipleHistory,
    },
  },
);
const multipleHistoryRejected = createSurfaceRelationEdge(
  "surface-relation-multiple-history-rejected",
  nodeB.id,
  nodeC.id,
  {
    relation: "near",
    lifecycle: "rejected",
    revision: 3,
    parentRevision: 2,
    provenance: {
      source: "author",
      intent: "manuallyDeleted",
      operation: "manual-reject",
      revision: 3,
      history: multipleHistory,
    },
  },
);
const multipleHistorySurface = createSurfaceGraph([patchA, patchB, patchC], 8, {
  revision: 3,
  edges: [multipleHistoryConfirmed, multipleHistoryRejected],
});
assert.equal(validateSurfaceGraph(multipleHistorySurface).ok, true);
const multipleHistorySerialized = serializeSurfaceGraph(multipleHistorySurface);
const multipleHistoryParsed = parseSurfaceGraph(multipleHistorySerialized);
assert.deepEqual(multipleHistoryParsed, JSON.parse(multipleHistorySerialized));
assert.equal(
  await fingerprintSurfaceGraph(multipleHistorySurface),
  await fingerprintSurfaceGraph(multipleHistoryParsed),
);
const stale = {
  ...rejected,
  edges: rejected.edges.map((edge) => {
    if (edge.id !== proposedEdge.id) return edge;
    const staleEdge = { ...edge };
    delete staleEdge.relationState;
    return { ...staleEdge, lifecycle: "stale" as const };
  }),
};
assert.deepEqual(confirmedSurfaceComponents(stale), [[nodeA.id], [nodeB.id], [nodeC.id]]);

const proposedAgain = addSurfaceRelation(
  rejected,
  createSurfaceRelationEdge("surface-relation-c", nodeA.id, nodeC.id),
);
assert.equal(proposedAgain.edges.length, 3);
assert.equal(proposedAgain.edges[2].lifecycle, "candidate");
assert.equal(proposedAgain.revision, 3);
assert.equal(proposedAgain.parentRevision, rejected.revision);
assert.deepEqual(proposedAgain.lineage, [0, 1, 2, 3]);
assert.equal(proposedAgain.edges[2].revision, proposedAgain.revision);
assert.equal(proposedAgain.edges[2].parentRevision, null);
assert.equal(proposedAgain.edges[2].provenance.source, "generated");
assert.equal(proposedAgain.edges[2].provenance.intent, "generated");
assert.equal(proposedAgain.edges[2].provenance.history?.length, 1);
assert.equal(proposedAgain.provenance.source, "generated");
assert.equal(proposedAgain.provenance.history?.length, 3);
assert.notEqual(proposedAgain.revision, rejected.revision);

const confirmedBeforePropose = JSON.stringify(confirmed);
const proposedFromConfirmed = proposeSurfaceRelation(confirmed, proposedEdge.id);
assert.equal(proposedFromConfirmed.revision, confirmed.revision + 1);
assert.equal(proposedFromConfirmed.edges[0].lifecycle, "candidate");
assert.equal(proposedFromConfirmed.edges[0].provenance.source, "generated");
assert.equal(proposedFromConfirmed.edges[0].provenance.history?.length, 2);
assert.equal(JSON.stringify(confirmed), confirmedBeforePropose);

const orderedSurface = {
  ...confirmed,
  nodes: [...confirmed.nodes].reverse(),
  edges: [...confirmed.edges].reverse(),
};
const canonical = serializeSurfaceGraph(confirmed);
assert.equal(serializeSurfaceGraph(orderedSurface), canonical);
assert.deepEqual(parseSurfaceGraph(canonical), JSON.parse(canonical));
assert.equal(
  await fingerprintSurfaceGraph(confirmed),
  await fingerprintSurfaceGraph(orderedSurface),
);
const reversedInputSurface = createSurfaceGraph([patchC, patchA, patchB], 8, {
  edges: [proposedEdgeB, proposedEdge],
});
assert.deepEqual(
  reversedInputSurface.nodes.map((node) => node.authorElementId),
  surface.nodes.map((node) => node.authorElementId),
);
assert.equal(serializeSurfaceGraph(reversedInputSurface), serializeSurfaceGraph(surface));
assert.equal(
  await fingerprintSurfaceGraph(reversedInputSurface),
  await fingerprintSurfaceGraph(surface),
);
const defaultFingerprint = await fingerprintSurfaceGraph(surface);
assert.equal(await fingerprintSurfaceGraph(surface, { forceFallback: true }), defaultFingerprint);
const attemptedCanonicalOverride = {
  forceFallback: false,
  sortGraphEntityCollections: false,
  entityCollectionPaths: ["edges"],
} as unknown as Parameters<typeof fingerprintSurfaceGraph>[1];
assert.equal(await fingerprintSurfaceGraph(surface, attemptedCanonicalOverride), defaultFingerprint);

const missingGraphParent = { ...surface } as Record<string, unknown>;
delete missingGraphParent.parentRevision;
assert.equal(validateSurfaceGraph(missingGraphParent).ok, false);
const missingNodeParent = {
  ...surface,
  nodes: surface.nodes.map((node) => {
    const copy = { ...node } as Record<string, unknown>;
    delete copy.parentRevision;
    return copy;
  }),
};
assert.equal(validateSurfaceGraph(missingNodeParent).ok, false);
const missingEdgeProvenance = {
  ...surface,
  edges: surface.edges.map((edge, index) => index === 0
    ? (() => {
      const copy = { ...edge } as Record<string, unknown>;
      delete copy.provenance;
      return copy;
    })()
    : edge),
};
assert.equal(validateSurfaceGraph(missingEdgeProvenance).ok, false);

const overflowSurface = createSurfaceGraph([patchA, patchB], 8, {
  revision: Number.MAX_SAFE_INTEGER,
  edges: [createSurfaceRelationEdge("surface-relation-overflow", nodeA.id, nodeB.id)],
});
assert.deepEqual(overflowSurface.lineage, [Number.MAX_SAFE_INTEGER]);
assert.throws(
  () => confirmSurfaceRelation(overflowSurface, "surface-relation-overflow"),
  /cannot advance beyond Number\.MAX_SAFE_INTEGER/,
);

const duplicateNode = {
  ...surface,
  nodes: [...surface.nodes, { ...surface.nodes[0] }],
};
assert.equal(validateSurfaceGraph(duplicateNode).ok, false);
assert.throws(() => confirmedSurfaceComponents(duplicateNode), /duplicates/);
const danglingRelation = {
  ...surface,
  edges: [{ ...surface.edges[0], from: "missing-surface-node" }, surface.edges[1]],
};
assert.equal(validateSurfaceGraph(danglingRelation).ok, false);
assert.throws(() => serializeSurfaceGraph(danglingRelation as unknown as Parameters<typeof serializeSurfaceGraph>[0]), /dangling surface endpoint/);
const wrongDiscriminant = {
  ...surface,
  edges: [{ ...surface.edges[0], edgeType: "interior-strut" }, surface.edges[1]],
};
assert.equal(validateSurfaceGraph(wrongDiscriminant).ok, false);
assert.throws(() => serializeSurfaceGraph(wrongDiscriminant as unknown as Parameters<typeof serializeSurfaceGraph>[0]), /edgeType is invalid/);

console.log("surfaceGraph.test.ts: all assertions passed");

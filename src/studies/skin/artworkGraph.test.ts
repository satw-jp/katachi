import assert from "node:assert/strict";
import {
  acceptArtworkCandidate,
  createArtworkConnection,
  createArtworkGraph,
  createIntegrationCandidate,
  createInteriorGraph,
  createInteriorStrutEdge,
  createInteriorStrutNode,
  fingerprintArtworkGraph,
  parseArtworkGraph,
  rejectArtworkCandidate,
  replaceSurfaceDraft,
  serializeArtworkGraph,
  validateArtworkGraph,
} from "./artworkGraph.ts";
import {
  addSurfaceRelation,
  confirmSurfaceRelation,
  createSurfaceGraph,
  createSurfaceRelationEdge,
} from "./surfaceGraph.ts";
import type { SurfaceRelationEdge } from "./surfaceGraph.ts";
import type { Patch } from "./field.ts";
import { canonicalStringify } from "./graphCore.ts";

function makePatch(id: number): Patch {
  return {
    id,
    shape: "coin",
    points: [{ x: id, y: id + 0.25, z: id + 0.5, r: 0.35 }],
  };
}

const nodesSurface = createSurfaceGraph([makePatch(1), makePatch(2)], 2);
const proposedRelation = createSurfaceRelationEdge(
  "surface-relation",
  "surface-author:2:1",
  "surface-author:2:2",
  { relation: "contact", lifecycle: "candidate" },
);
const surfaceWithProposal = addSurfaceRelation(nodesSurface, proposedRelation);
// A fixture must use the shipped transition; it must not forge a confirmed edge.
const surface = confirmSurfaceRelation(surfaceWithProposal, "surface-relation");
const relation: SurfaceRelationEdge = surface.edges[0];
assert.equal(relation.edgeType, "surface-relation");
assert.equal(relation.lifecycle, "confirmed");
assert.equal(relation.relationState, "confirmed");

const stage3 = createArtworkGraph(surface, { id: "artwork-test" });
assert.equal(stage3.state, "surfaceDraft");
assert.equal(stage3.integratedConfirmed, null);
assert.deepEqual(stage3.integrationCandidates, []);
assert.deepEqual(stage3.surfaceDraft, surface);
assert.equal(validateArtworkGraph(stage3).ok, true);

const interiorNodeA = createInteriorStrutNode("interior-a", { x: 0, y: 0, z: 0 }, 0.2);
const interiorNodeB = createInteriorStrutNode("interior-b", { x: 1, y: 1, z: 1 }, 0.2);
const interiorEdge = createInteriorStrutEdge("strut-a", interiorNodeA.id, interiorNodeB.id, 0.15);
const interior = createInteriorGraph([interiorNodeA, interiorNodeB], [interiorEdge]);
const connection = createArtworkConnection(
  "connection-a",
  surface.nodes[0].id,
  interiorNodeA.id,
  0.18,
);
assert.equal(interiorEdge.edgeType, "interior-strut");
assert.equal(connection.edgeType, "artwork-connection");
assert.notEqual(interiorEdge.edgeType, connection.edgeType);
assert.notEqual(connection.edgeType, relation.edgeType);

const stage3Bytes = serializeArtworkGraph(stage3);
const firstCandidateGraph = createIntegrationCandidate(
  stage3,
  { interior, connections: [connection] },
  {
    candidateId: "candidate-a",
    generator: "dry-web-test",
    algorithmVersion: "dry-web-test-v1",
  },
);
assert.equal(firstCandidateGraph.state, "integrationCandidate");
assert.equal(firstCandidateGraph.integrationCandidates.length, 1);
const candidateA = firstCandidateGraph.integrationCandidates[0];
assert.equal(candidateA.provenance.source, "generated");
assert.equal(candidateA.provenance.intent, "generated");
assert.equal(candidateA.parentRevision, stage3.revision);
assert.equal(candidateA.baseRevision, stage3.surfaceDraft.revision);
assert.equal(candidateA.baseFingerprint.length > 0, true);
assert.equal(candidateA.inputFingerprint.length > 0, true);
assert.equal(firstCandidateGraph.parentRevision, stage3.revision);
assert.equal(firstCandidateGraph.lineage[firstCandidateGraph.lineage.length - 1], firstCandidateGraph.revision);
assert.equal(serializeArtworkGraph(stage3), stage3Bytes);
assert.deepEqual(stage3.integrationCandidates, []);
assert.equal(stage3.integratedConfirmed, null);

const acceptedFirst = acceptArtworkCandidate(firstCandidateGraph, "candidate-a");
assert.equal(acceptedFirst.state, "integratedConfirmed");
assert.equal(acceptedFirst.lifecycle, "confirmed");
assert.equal(acceptedFirst.integratedConfirmed?.sourceCandidateId, "candidate-a");
assert.equal(acceptedFirst.integratedConfirmed?.revision, acceptedFirst.revision);
assert.equal(acceptedFirst.integratedConfirmed?.interior.nodes.length, 2);
assert.equal(acceptedFirst.integratedConfirmed?.interior.edges.length, 1);
assert.equal(acceptedFirst.integratedConfirmed?.interior.nodes[0].lifecycle, "confirmed");
assert.equal(acceptedFirst.integratedConfirmed?.interior.edges[0].lifecycle, "confirmed");
assert.equal(acceptedFirst.integratedConfirmed?.interior.nodes[0].provenance.source, "author");
assert.equal(acceptedFirst.integratedConfirmed?.interior.nodes[0].provenance.history?.[0]?.source, "generated");
const confirmedSlotBytes = canonicalStringify(acceptedFirst.integratedConfirmed);
const confirmedProvenanceFacts = acceptedFirst.integratedConfirmed
  ? [acceptedFirst.integratedConfirmed.provenance, ...(acceptedFirst.integratedConfirmed.provenance.history ?? [])]
  : [];
assert.equal(confirmedProvenanceFacts.some((fact) => fact.source === "generated"), true);
assert.equal(acceptedFirst.integratedConfirmed?.provenance.source, "author");
assert.equal(acceptedFirst.integratedConfirmed?.provenance.intent, "pinned");

const secondNode = createInteriorStrutNode("interior-c", { x: 2, y: 2, z: 2 }, 0.2);
const secondInterior = createInteriorGraph([interiorNodeA, secondNode], [
  createInteriorStrutEdge("strut-b", interiorNodeA.id, secondNode.id, 0.25),
]);
const secondConnection = createArtworkConnection(
  "connection-b",
  surface.nodes[1].id,
  secondNode.id,
  0.22,
);

// Multiple candidates can share the same active snapshot. Adding candidates
// advances the container only; it does not alter the confirmed slot bytes.
const candidateBaseBytes = serializeArtworkGraph(acceptedFirst);
const twoCandidates = createIntegrationCandidate(
  acceptedFirst,
  { interior: secondInterior, connections: [secondConnection] },
  { candidateId: "candidate-b" },
);
const threeCandidates = createIntegrationCandidate(
  twoCandidates,
  { interior, connections: [connection] },
  { candidateId: "candidate-c" },
);
assert.equal(serializeArtworkGraph(acceptedFirst), candidateBaseBytes);
assert.equal(canonicalStringify(acceptedFirst.integratedConfirmed), confirmedSlotBytes);
assert.equal(threeCandidates.integrationCandidates.length, 3);
assert.equal(
  threeCandidates.integrationCandidates[1].baseFingerprint,
  threeCandidates.integrationCandidates[2].baseFingerprint,
);
assert.equal(
  threeCandidates.integrationCandidates[1].baseRevision,
  acceptedFirst.integratedConfirmed!.revision,
);
assert.equal(
  threeCandidates.integrationCandidates[2].baseRevision,
  acceptedFirst.integratedConfirmed!.revision,
);

const acceptedChosen = acceptArtworkCandidate(threeCandidates, "candidate-b");
assert.equal(acceptedChosen.state, "integratedConfirmed");
assert.equal(acceptedChosen.integratedConfirmed?.sourceCandidateId, "candidate-b");
assert.equal(acceptedChosen.integrationCandidates.find((item) => item.candidateId === "candidate-b")?.lifecycle, "confirmed");
assert.equal(acceptedChosen.integrationCandidates.find((item) => item.candidateId === "candidate-a")?.lifecycle, "confirmed");
assert.equal(acceptedChosen.integrationCandidates.find((item) => item.candidateId === "candidate-c")?.lifecycle, "stale");
assert.throws(() => acceptArtworkCandidate(acceptedChosen, "candidate-c"), /stale|no longer pending/);

// A retained candidate records only a branch of the container history.  Its
// full revision lineage must nevertheless be an ordered subsequence of every
// later container lineage, including sibling candidate creation and accept.
for (const candidate of threeCandidates.integrationCandidates) {
  assert.equal(candidate.lineage.every((revision) => threeCandidates.lineage.includes(revision)), true);
  assert.equal(threeCandidates.lineage.includes(candidate.candidateRevision), true);
  assert.equal(threeCandidates.lineage.includes(candidate.revision), true);
  assert.equal(candidate.parentRevision === null || threeCandidates.lineage.includes(candidate.parentRevision), true);
}
const futureCandidateRevision = JSON.parse(JSON.stringify(threeCandidates)) as typeof threeCandidates;
futureCandidateRevision.integrationCandidates[1].candidateRevision = futureCandidateRevision.revision + 1;
assert.equal(validateArtworkGraph(futureCandidateRevision).ok, false);
const outsideCandidateLineage = JSON.parse(JSON.stringify(threeCandidates)) as typeof threeCandidates;
(outsideCandidateLineage.integrationCandidates[1].lineage as number[])[0] = 1;
assert.equal(validateArtworkGraph(outsideCandidateLineage).ok, false);
const outsideCandidateParent = JSON.parse(JSON.stringify(threeCandidates)) as typeof threeCandidates;
outsideCandidateParent.integrationCandidates[1].parentRevision = 1;
assert.equal(validateArtworkGraph(outsideCandidateParent).ok, false);

const acceptedSourceCandidate = acceptedChosen.integrationCandidates
  .find((item) => item.candidateId === "candidate-b");
assert.ok(acceptedSourceCandidate);
assert.ok(acceptedChosen.integratedConfirmed);
assert.equal(
  canonicalStringify({
    surface: acceptedSourceCandidate.surface,
    interior: acceptedSourceCandidate.interior,
    connections: acceptedSourceCandidate.connections,
  }),
  canonicalStringify({
    surface: acceptedChosen.integratedConfirmed.surface,
    interior: acceptedChosen.integratedConfirmed.interior,
    connections: acceptedChosen.integratedConfirmed.connections,
  }),
);
assert.equal(
  canonicalStringify(acceptedSourceCandidate.provenance),
  canonicalStringify(acceptedChosen.integratedConfirmed.provenance),
);

function assertArtworkBoundaryRejects(
  graph: typeof acceptedChosen,
  label: string,
): void {
  assert.equal(validateArtworkGraph(graph).ok, false, label + " validate");
  assert.throws(() => serializeArtworkGraph(graph), label + " serialize");
  assert.throws(() => parseArtworkGraph(JSON.stringify(graph)), label + " parse");
}

async function assertArtworkFingerprintRejects(
  graph: typeof acceptedChosen,
  label: string,
): Promise<void> {
  let rejected = false;
  try {
    await fingerprintArtworkGraph(graph);
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, label + " fingerprint");
}

function assertArtworkRuntimeBoundaryRejects(
  graph: typeof acceptedChosen,
  label: string,
): Promise<void> {
  assert.equal(validateArtworkGraph(graph).ok, false, label + " validate");
  assert.throws(() => serializeArtworkGraph(graph), label + " serialize");
  return assertArtworkFingerprintRejects(graph, label);
}

/** Mutate both persisted baseRevision copies to exercise the independent anchor. */
function rewriteCandidateBaseRevision(
  graph: typeof acceptedChosen,
  candidateId: string,
  baseRevision: number,
): typeof acceptedChosen {
  const mutated = JSON.parse(JSON.stringify(graph)) as typeof acceptedChosen;
  const candidate = mutated.integrationCandidates.find((item) => item.candidateId === candidateId);
  assert.ok(candidate);
  candidate.baseRevision = baseRevision;
  const generatedFact = candidate.provenance.source === "generated"
    ? candidate.provenance
    : candidate.provenance.history?.find((fact) =>
      fact.source === "generated" && fact.intent === "generated",
    );
  assert.ok(generatedFact);
  assert.equal(typeof generatedFact.operation, "string");
  const prefix = "integration-candidate:";
  assert.equal(generatedFact.operation!.startsWith(prefix), true);
  const payload = JSON.parse(generatedFact.operation!.slice(prefix.length)) as {
    baseRevision: number;
    [key: string]: unknown;
  };
  payload.baseRevision = baseRevision;
  generatedFact.operation = prefix + canonicalStringify(payload);
  return mutated;
}

const postAcceptCandidateSnapshotMutation = JSON.parse(JSON.stringify(acceptedChosen)) as typeof acceptedChosen;
postAcceptCandidateSnapshotMutation.integrationCandidates
  .find((item) => item.candidateId === "candidate-b")!.interior.nodes[0].radius += 0.01;
assertArtworkBoundaryRejects(postAcceptCandidateSnapshotMutation, "post-accept candidate snapshot mutation");
await assertArtworkFingerprintRejects(postAcceptCandidateSnapshotMutation, "post-accept candidate snapshot mutation");

const postAcceptGeneratorMutation = JSON.parse(JSON.stringify(acceptedChosen)) as typeof acceptedChosen;
postAcceptGeneratorMutation.integrationCandidates
  .find((item) => item.candidateId === "candidate-b")!.generator = "mutated-generator";
assertArtworkBoundaryRejects(postAcceptGeneratorMutation, "post-accept generator mutation");
await assertArtworkFingerprintRejects(postAcceptGeneratorMutation, "post-accept generator mutation");

const postAcceptFingerprintMutation = JSON.parse(JSON.stringify(acceptedChosen)) as typeof acceptedChosen;
postAcceptFingerprintMutation.integrationCandidates
  .find((item) => item.candidateId === "candidate-b")!.baseFingerprint = "mutated-base";
assertArtworkBoundaryRejects(postAcceptFingerprintMutation, "post-accept base fingerprint mutation");
await assertArtworkFingerprintRejects(postAcceptFingerprintMutation, "post-accept base fingerprint mutation");

const postAcceptProvenanceMutation = JSON.parse(JSON.stringify(acceptedChosen)) as typeof acceptedChosen;
postAcceptProvenanceMutation.integrationCandidates
  .find((item) => item.candidateId === "candidate-b")!.provenance.history![0].algorithmVersion = "mutated-algorithm";
assertArtworkBoundaryRejects(postAcceptProvenanceMutation, "post-accept provenance mutation");
await assertArtworkFingerprintRejects(postAcceptProvenanceMutation, "post-accept provenance mutation");

const postAcceptConfirmedMutation = JSON.parse(JSON.stringify(acceptedChosen)) as typeof acceptedChosen;
postAcceptConfirmedMutation.integratedConfirmed!.connections[0].radius += 0.01;
assertArtworkBoundaryRejects(postAcceptConfirmedMutation, "post-accept confirmed-slot mutation");
await assertArtworkFingerprintRejects(postAcceptConfirmedMutation, "post-accept confirmed-slot mutation");

// baseRevision is independently anchored to the active snapshot at
// generation. Updating the candidate field and its generated payload together
// must still fail at every runtime boundary, including each retained lifecycle.
const pendingBaseRevisionMutation = rewriteCandidateBaseRevision(
  firstCandidateGraph,
  "candidate-a",
  candidateA.baseRevision - 1,
);
await assertArtworkRuntimeBoundaryRejects(
  pendingBaseRevisionMutation,
  "pending coordinated base revision mutation",
);
assert.throws(
  () => acceptArtworkCandidate(pendingBaseRevisionMutation, "candidate-a"),
  /baseRevision|authoritative active snapshot/,
);

const confirmedBaseRevisionMutation = rewriteCandidateBaseRevision(
  acceptedChosen,
  "candidate-b",
  (acceptedSourceCandidate.baseRevision ?? 0) - 1,
);
await assertArtworkRuntimeBoundaryRejects(
  confirmedBaseRevisionMutation,
  "confirmed coordinated base revision mutation",
);

const staleBaseRevisionMutation = rewriteCandidateBaseRevision(
  acceptedChosen,
  "candidate-c",
  acceptedChosen.integrationCandidates.find((item) => item.candidateId === "candidate-c")!.baseRevision - 1,
);
await assertArtworkRuntimeBoundaryRejects(
  staleBaseRevisionMutation,
  "stale coordinated base revision mutation",
);

// Rejecting a candidate retains the active confirmed snapshot exactly.
const rejectSourceBytes = canonicalStringify(acceptedChosen.integratedConfirmed);
const withRejectedCandidate = createIntegrationCandidate(
  acceptedChosen,
  { interior, connections: [connection] },
  { candidateId: "candidate-reject" },
);
const rejected = rejectArtworkCandidate(withRejectedCandidate, "candidate-reject");
assert.equal(rejected.state, "integratedConfirmed");
assert.equal(rejected.integrationCandidates.find((item) => item.candidateId === "candidate-reject")?.lifecycle, "rejected");
assert.equal(canonicalStringify(rejected.integratedConfirmed), rejectSourceBytes);
assert.deepEqual(rejected.integratedConfirmed, acceptedChosen.integratedConfirmed);
assert.throws(() => rejectArtworkCandidate(rejected, "candidate-reject"), /stale|no longer pending/);
const rejectedBaseRevisionMutation = rewriteCandidateBaseRevision(
  rejected,
  "candidate-reject",
  rejected.integrationCandidates.find((item) => item.candidateId === "candidate-reject")!.baseRevision - 1,
);
await assertArtworkRuntimeBoundaryRejects(
  rejectedBaseRevisionMutation,
  "rejected coordinated base revision mutation",
);

// A changed active Surface draft makes a pending candidate stale. The
// freshness check is the active-snapshot fingerprint, not container revision.
const staleSource = createArtworkGraph(surface, { id: "stale-test" });
const staleCandidate = createIntegrationCandidate(
  staleSource,
  { interior, connections: [connection] },
  { candidateId: "candidate-stale" },
);
const changedSurface = createSurfaceGraph([makePatch(1), makePatch(3)], 2);
const staleGraph = replaceSurfaceDraft(staleCandidate, changedSurface);
assert.equal(staleGraph.integrationCandidates[0].lifecycle, "stale");
assert.throws(() => acceptArtworkCandidate(staleGraph, "candidate-stale"), /stale|no longer pending/);

const rejectedCandidateMutation = JSON.parse(JSON.stringify(rejected)) as typeof rejected;
rejectedCandidateMutation.integrationCandidates
  .find((item) => item.candidateId === "candidate-reject")!.connections[0].radius += 0.01;
assertArtworkBoundaryRejects(rejectedCandidateMutation, "rejected candidate mutation");
await assertArtworkFingerprintRejects(rejectedCandidateMutation, "rejected candidate mutation");
const staleCandidateMutation = JSON.parse(JSON.stringify(staleGraph)) as typeof staleGraph;
staleCandidateMutation.integrationCandidates[0].interior.nodes[0].radius += 0.01;
assertArtworkBoundaryRejects(staleCandidateMutation, "stale candidate mutation");
await assertArtworkFingerprintRejects(staleCandidateMutation, "stale candidate mutation");

// Strict persistence checks must inspect the original object graph before any
// clone/normalization can drop the malformed fact.
const inheritedFact = JSON.parse(JSON.stringify(firstCandidateGraph)) as typeof firstCandidateGraph;
const inheritedNode = Object.create({ radius: interiorNodeA.radius }) as Record<string, unknown>;
Object.assign(inheritedNode, inheritedFact.integrationCandidates[0].interior.nodes[0]);
delete inheritedNode.radius;
inheritedFact.integrationCandidates[0].interior.nodes[0] = inheritedNode as unknown as typeof interiorNodeA;
await assertArtworkRuntimeBoundaryRejects(inheritedFact, "inherited nested artwork fact");

const nonEnumerableFact = JSON.parse(JSON.stringify(firstCandidateGraph)) as typeof firstCandidateGraph;
Object.defineProperty(nonEnumerableFact.integrationCandidates[0].interior.nodes[0], "hiddenFact", {
  configurable: true,
  enumerable: false,
  value: true,
});
await assertArtworkRuntimeBoundaryRejects(nonEnumerableFact, "non-enumerable nested artwork fact");

const symbolFact = JSON.parse(JSON.stringify(firstCandidateGraph)) as typeof firstCandidateGraph;
Object.defineProperty(symbolFact.integrationCandidates[0].interior.nodes[0], Symbol("hiddenFact"), {
  configurable: true,
  enumerable: true,
  value: true,
});
await assertArtworkRuntimeBoundaryRejects(symbolFact, "symbol nested artwork fact");

const undefinedFact = JSON.parse(JSON.stringify(firstCandidateGraph)) as typeof firstCandidateGraph;
(undefinedFact.integrationCandidates[0] as unknown as Record<string, unknown>).generator = undefined;
await assertArtworkRuntimeBoundaryRejects(undefinedFact, "undefined nested artwork fact");

const functionFact = JSON.parse(JSON.stringify(firstCandidateGraph)) as typeof firstCandidateGraph;
(functionFact.integrationCandidates[0] as unknown as Record<string, unknown>).generator = () => "hidden";
await assertArtworkRuntimeBoundaryRejects(functionFact, "function nested artwork fact");

const bigintFact = JSON.parse(JSON.stringify(firstCandidateGraph)) as typeof firstCandidateGraph;
(bigintFact.integrationCandidates[0] as unknown as Record<string, unknown>).baseRevision = 1n;
await assertArtworkRuntimeBoundaryRejects(bigintFact, "bigint nested artwork fact");

const cyclicFact = JSON.parse(JSON.stringify(firstCandidateGraph)) as typeof firstCandidateGraph;
(cyclicFact.integrationCandidates[0] as unknown as Record<string, unknown>).cycle = cyclicFact;
await assertArtworkRuntimeBoundaryRejects(cyclicFact, "cyclic nested artwork fact");

// Constructors must inspect every original argument before reading fields or
// cloning. This includes scalar arguments, option objects, Surface inputs,
// and replacement graphs.
assert.throws(
  () => createInteriorStrutNode((() => "hidden") as unknown as string, { x: 0, y: 0, z: 0 }, 0.2),
  /interior node input/,
);
assert.throws(
  () => createInteriorStrutEdge(
    "unsafe-edge",
    "interior-a",
    "interior-b",
    1n as unknown as number,
  ),
  /interior edge input/,
);
const nonEnumerableConnectionOptions: Record<string, unknown> = {};
Object.defineProperty(nonEnumerableConnectionOptions, "revision", {
  configurable: true,
  enumerable: false,
  value: 0,
});
assert.throws(
  () => createArtworkConnection(
    "unsafe-connection",
    surface.nodes[0].id,
    interiorNodeA.id,
    0.18,
    nonEnumerableConnectionOptions as never,
  ),
  /artwork connection input/,
);
const unsafeInteriorNode = JSON.parse(JSON.stringify(interiorNodeA)) as typeof interiorNodeA;
Object.defineProperty(unsafeInteriorNode, "hiddenFact", {
  configurable: true,
  enumerable: false,
  value: true,
});
assert.throws(
  () => createInteriorGraph([unsafeInteriorNode], []),
  /interior graph input/,
);
const unsafeSurfaceInput = JSON.parse(JSON.stringify(surface)) as typeof surface;
Object.defineProperty(unsafeSurfaceInput.nodes[0], "hiddenFact", {
  configurable: true,
  enumerable: false,
  value: true,
});
assert.throws(
  () => createArtworkGraph(unsafeSurfaceInput),
  /artwork graph input/,
);
const unsafeReplacementInput = JSON.parse(JSON.stringify(surface)) as typeof surface;
unsafeReplacementInput.nodes[0].patch.points[0].x = undefined as never;
assert.throws(
  () => replaceSurfaceDraft(stage3, unsafeReplacementInput),
  /surface draft replacement input/,
);
const inheritedCandidateInput = Object.create({ interior }) as Record<string, unknown>;
inheritedCandidateInput.connections = [connection];
assert.throws(
  () => createIntegrationCandidate(stage3, inheritedCandidateInput as never),
  /integration candidate input/,
);
assert.throws(
  () => serializeArtworkGraph(acceptedChosen, { unsupported: () => "hidden" }),
  /serialization options/,
);
let invalidFingerprintOptionsRejected = false;
let invalidFingerprintOptionsMessage = "";
try {
  await fingerprintArtworkGraph(acceptedChosen, { unsupported: () => "hidden" });
} catch (error) {
  invalidFingerprintOptionsRejected = true;
  invalidFingerprintOptionsMessage = error instanceof Error ? error.message : String(error);
}
assert.equal(invalidFingerprintOptionsRejected, true, "fingerprint options");
assert.match(invalidFingerprintOptionsMessage, /fingerprint options/);

// Fail closed for malformed metadata, finite geometry, duplicate facts,
// dangling endpoints, and cross-domain endpoint confusion.
const malformedMetadata = {
  ...stage3,
  surfaceDraft: {
    ...stage3.surfaceDraft,
    nodes: [{ ...stage3.surfaceDraft.nodes[0], revision: Number.NaN }],
  },
};
assert.equal(validateArtworkGraph(malformedMetadata).ok, false);
assert.equal(validateArtworkGraph({ ...stage3, integrationCandidates: [null] }).ok, false);
assert.equal(validateArtworkGraph({ ...stage3, integratedConfirmed: undefined }).ok, false);
const malformedGeometry = {
  ...firstCandidateGraph,
  integrationCandidates: [{
    ...firstCandidateGraph.integrationCandidates[0],
    interior: {
      ...firstCandidateGraph.integrationCandidates[0].interior,
      nodes: [{ ...interiorNodeA, position: { x: Number.NaN, y: 0, z: 0 } }, interiorNodeB],
    },
  }],
};
assert.equal(validateArtworkGraph(malformedGeometry).ok, false);
const duplicateInterior = {
  ...firstCandidateGraph,
  integrationCandidates: [{
    ...firstCandidateGraph.integrationCandidates[0],
    interior: { kind: "interior-graph" as const, nodes: [interiorNodeA, { ...interiorNodeA }], edges: [] },
  }],
};
assert.equal(validateArtworkGraph(duplicateInterior).ok, false);
const danglingInterior = {
  ...firstCandidateGraph,
  integrationCandidates: [{
    ...firstCandidateGraph.integrationCandidates[0],
    interior: {
      kind: "interior-graph" as const,
      nodes: [interiorNodeA],
      edges: [{ ...interiorEdge, from: interiorNodeA.id, to: "missing" }],
    },
  }],
};
assert.equal(validateArtworkGraph(danglingInterior).ok, false);
const wrongDomainConnection = {
  ...firstCandidateGraph,
  integrationCandidates: [{
    ...firstCandidateGraph.integrationCandidates[0],
    connections: [{ ...connection, surfaceNodeId: interiorNodeA.id, from: interiorNodeA.id }],
  }],
};
assert.equal(validateArtworkGraph(wrongDomainConnection).ok, false);
assert.throws(() => serializeArtworkGraph(wrongDomainConnection as unknown as Parameters<typeof serializeArtworkGraph>[0]), /dangling surface endpoint|from\/to/);

// Canonical presentation order is locked, and callers cannot turn sorting off.
const acceptedBytes = serializeArtworkGraph(acceptedChosen);
const reversed = {
  ...acceptedChosen,
  surfaceDraft: {
    ...acceptedChosen.surfaceDraft,
    nodes: [...acceptedChosen.surfaceDraft.nodes].reverse(),
    edges: [...acceptedChosen.surfaceDraft.edges].reverse(),
  },
  integrationCandidates: [...acceptedChosen.integrationCandidates].reverse().map((candidate) => ({
    ...candidate,
    surface: {
      ...candidate.surface,
      nodes: [...candidate.surface.nodes].reverse(),
      edges: [...candidate.surface.edges].reverse(),
    },
    interior: {
      ...candidate.interior,
      nodes: [...candidate.interior.nodes].reverse(),
      edges: [...candidate.interior.edges].reverse(),
    },
    connections: [...candidate.connections].reverse(),
  })),
  integratedConfirmed: acceptedChosen.integratedConfirmed
    ? {
      ...acceptedChosen.integratedConfirmed,
      surface: {
        ...acceptedChosen.integratedConfirmed.surface,
        nodes: [...acceptedChosen.integratedConfirmed.surface.nodes].reverse(),
        edges: [...acceptedChosen.integratedConfirmed.surface.edges].reverse(),
      },
      interior: {
        ...acceptedChosen.integratedConfirmed.interior,
        nodes: [...acceptedChosen.integratedConfirmed.interior.nodes].reverse(),
        edges: [...acceptedChosen.integratedConfirmed.interior.edges].reverse(),
      },
      connections: [...acceptedChosen.integratedConfirmed.connections].reverse(),
    }
    : null,
};
assert.equal(serializeArtworkGraph(reversed), acceptedBytes);
assert.equal(serializeArtworkGraph(reversed, { sortGraphEntityCollections: false }), acceptedBytes);
assert.deepEqual(parseArtworkGraph(acceptedBytes), JSON.parse(acceptedBytes));
assert.equal(await fingerprintArtworkGraph(acceptedChosen), await fingerprintArtworkGraph(reversed));
assert.equal(await fingerprintArtworkGraph(acceptedChosen, { sortGraphEntityCollections: false }), await fingerprintArtworkGraph(reversed));

console.log("artworkGraph.test.ts: all assertions passed");

import assert from "node:assert/strict";
import {
  GRAPH_CORE_SCHEMA_VERSION,
  asGraphEntityCollection,
  asOrderedActionCollection,
  advanceGraphRevision,
  appendGraphProvenance,
  canonicalize,
  canonicalStringify,
  createGraphRevision,
  fingerprintGraph,
  graphProvenanceFacts,
  parseGraphDocument,
  serializeGraphDocument,
  serializeGraph,
  validateGraphDocument,
  validateGraphEndpointRecord,
  validateGraphProvenance,
  type GraphAuthorAction,
  type GraphCoreDocument,
  type GraphDocumentValidationOptions,
  type GraphEndpointSelector,
  type GraphProvenanceFact,
  type GraphProvenanceFactInput,
  type GraphFingerprintOptions,
  type GraphEndpointRecord,
  type GraphRecordMetadata,
  type GraphProvenance,
} from "./graphCore.ts";
import { sha256Hex } from "../../lib/hash.ts";

function generatedProvenance(revision = 0): GraphProvenanceFactInput {
  return {
    source: "generated",
    intent: "generated",
    generator: "graph-core-test",
    algorithmVersion: "test-v1",
    inputFingerprint: "input-test",
    revision,
  };
}

interface TestNode extends GraphRecordMetadata {
  facts: { value: number; label: string };
}

interface TestEdge extends GraphEndpointRecord {
  edgeType: string;
}

interface TestTypedEdge extends GraphRecordMetadata {
  source: string;
  target: string;
}

interface TestDocument extends GraphCoreDocument<TestNode, TestEdge, GraphAuthorAction> {
  typedEdges: TestTypedEdge[];
}

function makeNode(id: string, revision = 0): TestNode {
  return {
    id,
    revision,
    parentRevision: revision === 0 ? null : revision - 1,
    lifecycle: "confirmed",
    provenance: generatedProvenance(revision),
    facts: { value: 1.25, label: id },
  };
}

function makeEdge(id: string, from: string, to: string): TestEdge {
  return {
    id,
    from,
    to,
    edgeType: "caller-owned-typed-edge",
    revision: 0,
    parentRevision: null,
    lifecycle: "candidate",
    provenance: generatedProvenance(),
  };
}

function makeTypedEdge(id: string, source: string, target: string): TestTypedEdge {
  return {
    id,
    source,
    target,
    revision: 0,
    parentRevision: null,
    lifecycle: "candidate",
    provenance: generatedProvenance(),
  };
}

function ownProtoRecord(value: unknown): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  Object.defineProperty(record, "__proto__", {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
  return record;
}

function withInheritedProperty<T extends object>(
  value: T,
  key: string,
  inheritedValue: unknown,
): T {
  const clone = { ...value } as T & Record<string, unknown>;
  delete (clone as Record<string, unknown>)[key];
  const prototype: Record<string, unknown> = {};
  Object.defineProperty(prototype, key, {
    configurable: true,
    enumerable: true,
    value: inheritedValue,
    writable: true,
  });
  Object.setPrototypeOf(clone, prototype);
  return clone as T;
}

function withNonEnumerableProperty<T extends object>(
  value: T,
  key: string,
  propertyValue: unknown,
): T {
  const clone = { ...value } as T & Record<string, unknown>;
  Object.defineProperty(clone, key, {
    configurable: true,
    enumerable: false,
    value: propertyValue,
    writable: true,
  });
  return clone as T;
}

function makeDocument(): TestDocument {
  return {
    kind: "graph-core-test",
    schemaVersion: GRAPH_CORE_SCHEMA_VERSION,
    id: "graph-test",
    revision: 1,
    parentRevision: 0,
    lineage: [0, 1],
    lifecycle: "candidate",
    provenance: generatedProvenance(1),
    nodes: [makeNode("node-b"), makeNode("node-a")],
    edges: [
      makeEdge("edge-b", "node-b", "node-a"),
      makeEdge("edge-a", "node-a", "node-b"),
    ],
    typedEdges: [
      makeTypedEdge("typed-b", "node-b", "node-a"),
      makeTypedEdge("typed-a", "node-a", "node-b"),
    ],
    actions: [
      { type: "move", targetId: "node-b" },
      { type: "pin", targetId: "node-a" },
    ],
  };
}

const typedEdgeEndpointSelector: GraphEndpointSelector<TestTypedEdge> = (descriptor) => ({
  from: descriptor.source,
  to: descriptor.target,
});

const typedEdgeValidation: GraphDocumentValidationOptions<TestTypedEdge> = {
  entityCollectionPaths: ["nodes", "edges", "typedEdges"],
  typedEdgeDescriptors: [{
    collectionPath: "typedEdges",
    endpointSelector: typedEdgeEndpointSelector,
  }],
};

async function assertFingerprintRejects(
  value: unknown,
  options: GraphFingerprintOptions = { forceFallback: true },
): Promise<void> {
  let rejected = false;
  try {
    await fingerprintGraph(value, options);
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true);
}

// Object key insertion order is not part of the canonical graph bytes.
const keyOrderA = canonicalStringify({ z: 3, a: { y: 2, b: 1 } });
const keyOrderB = canonicalStringify({ a: { b: 1, y: 2 }, z: 3 });
assert.equal(keyOrderA, keyOrderB);

// Graph entity collection order is explicit: nodes/edges are schema paths,
// while arbitrary ID-bearing arrays are not inferred to be collections.
const collectionA = serializeGraph({
  nodes: [{ id: "b", value: 2 }, { id: "a", value: 1 }],
  edges: [{ id: "e2", from: "b", to: "a" }, { id: "e1", from: "a", to: "b" }],
});
const collectionB = serializeGraph({
  edges: [{ to: "b", from: "a", id: "e1" }, { to: "a", from: "b", id: "e2" }],
  nodes: [{ value: 1, id: "a" }, { value: 2, id: "b" }],
});
assert.equal(collectionA, collectionB);

// The wrapper makes an arbitrary collection's unordered semantics explicit.
assert.equal(
  canonicalStringify({ items: asGraphEntityCollection([{ id: "b" }, { id: "a" }]) }),
  canonicalStringify({ items: asGraphEntityCollection([{ id: "a" }, { id: "b" }]) }),
);

// Author action order is meaningful, even when actions have stable-looking IDs.
const orderedActionsA = { actions: asOrderedActionCollection([{ id: "b", type: "move" }, { id: "a", type: "pin" }]) };
const orderedActionsB = { actions: asOrderedActionCollection([{ id: "a", type: "pin" }, { id: "b", type: "move" }]) };
assert.notEqual(canonicalStringify(orderedActionsA), canonicalStringify(orderedActionsB));
assert.notEqual(
  canonicalStringify({ actions: [{ id: "b", type: "move" }, { id: "a", type: "pin" }] }),
  canonicalStringify({ actions: [{ id: "a", type: "pin" }, { id: "b", type: "move" }] }),
);
assert.notEqual(
  await fingerprintGraph(orderedActionsA, { forceFallback: true }),
  await fingerprintGraph(orderedActionsB, { forceFallback: true }),
);

// An explicit ordered path remains meaningful when it does not overlap a
// persisted unordered entity collection.
const explicitOrderedA = { events: [{ id: "event-b" }, { id: "event-a" }] };
const explicitOrderedB = { events: [{ id: "event-a" }, { id: "event-b" }] };
assert.notEqual(
  canonicalStringify(explicitOrderedA, { orderedArrayPaths: ["events"] }),
  canonicalStringify(explicitOrderedB, { orderedArrayPaths: ["events"] }),
);

// Provenance history preserves every ownership fact instead of replacing the
// generated fact with the latest author action.
const provenanceChain = [
  generatedProvenance(0),
  { source: "author" as const, intent: "pinned" as const, operation: "pin", revision: 1 },
  { source: "author" as const, intent: "manuallyMoved" as const, operation: "move", revision: 2 },
  { source: "author" as const, intent: "manuallyAdded" as const, operation: "add", revision: 3 },
  { source: "author" as const, intent: "manuallyDeleted" as const, operation: "delete", revision: 4 },
];
let provenance: GraphProvenance = provenanceChain[0];
for (const next of provenanceChain.slice(1)) provenance = appendGraphProvenance(provenance, next);
assert.deepEqual(
  graphProvenanceFacts(provenance).map((fact) => fact.intent),
  ["generated", "pinned", "manuallyMoved", "manuallyAdded", "manuallyDeleted"],
);
assert.equal(provenanceChain[0].intent, "generated");

// Provenance source and intent are a coherent pair.  Generated facts carry
// complete generator identity; author ownership facts do not need generator
// metadata and cannot masquerade as generated work.
const provenanceSources = ["generated", "author"] as const;
const provenanceIntents = [
  "generated",
  "pinned",
  "manuallyMoved",
  "manuallyAdded",
  "manuallyDeleted",
] as const;
for (const source of provenanceSources) {
  for (const intent of provenanceIntents) {
    const fact = {
      source,
      intent,
      ...(source === "generated" && intent === "generated"
        ? {
            generator: "graph-core-test",
            algorithmVersion: "test-v1",
            inputFingerprint: "input-test",
          }
        : {}),
    };
    const errors = validateGraphProvenance(fact);
    const expectedValid = source === "generated"
      ? intent === "generated"
      : intent !== "generated";
    assert.equal(errors.length === 0, expectedValid, `${source}/${intent} provenance combination`);
  }
}
for (const field of ["generator", "algorithmVersion", "inputFingerprint"] as const) {
  const missing = { ...generatedProvenance() } as Record<string, unknown>;
  delete missing[field];
  const missingErrors = validateGraphProvenance(missing);
  assert.ok(missingErrors.some((error) => error.includes(field) && error.includes("non-empty")));

  const empty = { ...generatedProvenance(), [field]: "" };
  const emptyErrors = validateGraphProvenance(empty);
  assert.ok(emptyErrors.some((error) => error.includes(field) && error.includes("non-empty")));
}

// Revision transitions clone values, advance monotonically, and retain the
// immediate parent plus complete lineage without mutating the source.
const mutableSource = { nested: { values: [1] } };
const revision0 = createGraphRevision(mutableSource);
mutableSource.nested.values.push(99);
assert.deepEqual(revision0.value, { nested: { values: [1] } });
const revision1 = advanceGraphRevision(revision0, (draft) => {
  draft.nested.values.push(2);
  return draft;
});
assert.equal(revision1.revision, 1);
assert.equal(revision1.parentRevision, 0);
assert.deepEqual(revision1.lineage, [0, 1]);
assert.deepEqual(revision0.value, { nested: { values: [1] } });
const revision2 = advanceGraphRevision(revision1, { nested: { values: [7] } });
assert.equal(revision2.revision, 2);
assert.equal(revision2.parentRevision, 1);
assert.deepEqual(revision2.lineage, [0, 1, 2]);
assert.deepEqual(revision1.value, { nested: { values: [1, 2] } });

const document = makeDocument();
const markedActionDocument = {
  ...document,
  actions: asOrderedActionCollection([...(document.actions ?? [])]),
};
assert.equal(validateGraphDocument(markedActionDocument).ok, true);
assert.equal(serializeGraphDocument(markedActionDocument), serializeGraphDocument(document));

// Provenance history is chronological evidence.  Reversing it changes both
// canonical bytes and fingerprints when it is not misclassified as a
// collection.
const provenanceHistoryA = {
  ...generatedProvenance(3),
  history: [
    { source: "author" as const, intent: "pinned" as const, operation: "pin", revision: 1 },
    { source: "author" as const, intent: "manuallyMoved" as const, operation: "move", revision: 2 },
  ],
};
const provenanceHistoryB = {
  ...provenanceHistoryA,
  history: [...provenanceHistoryA.history].reverse(),
};
assert.notEqual(
  canonicalStringify({ provenance: provenanceHistoryA }),
  canonicalStringify({ provenance: provenanceHistoryB }),
);
assert.notEqual(
  await fingerprintGraph({ provenance: provenanceHistoryA }, { forceFallback: true }),
  await fingerprintGraph({ provenance: provenanceHistoryB }, { forceFallback: true }),
);

const nonIncreasingProvenanceHistory = {
  ...provenanceHistoryA,
  history: [
    provenanceHistoryA.history[0],
    { ...provenanceHistoryA.history[1], revision: 1 },
  ],
};
const nonIncreasingHistoryErrors = validateGraphProvenance(nonIncreasingProvenanceHistory);
assert.ok(nonIncreasingHistoryErrors.some((error) => error.includes("previous history revision")));

const nonIncreasingCurrentProvenance = {
  ...generatedProvenance(2),
  history: provenanceHistoryA.history,
};
const nonIncreasingCurrentErrors = validateGraphProvenance(nonIncreasingCurrentProvenance);
assert.ok(nonIncreasingCurrentErrors.some((error) => error.includes("final history revision")));

const contradictoryHistoryDocument = {
  ...document,
  provenance: nonIncreasingCurrentProvenance,
};
const contradictoryHistoryResult = validateGraphDocument(contradictoryHistoryDocument);
assert.equal(contradictoryHistoryResult.ok, false);
assert.throws(() => serializeGraphDocument(contradictoryHistoryDocument), /final history revision/);

const appendBaseProvenance = {
  ...generatedProvenance(10),
  history: [{ ...generatedProvenance(8) }],
};
const appendBaseBytes = canonicalStringify(appendBaseProvenance);
const appendedProvenance = appendGraphProvenance(appendBaseProvenance, {
  source: "author",
  intent: "pinned",
  operation: "pin",
  revision: 11,
});
assert.equal(canonicalStringify(appendBaseProvenance), appendBaseBytes);
assert.deepEqual(appendBaseProvenance.history, [{ ...generatedProvenance(8) }]);
assert.deepEqual(
  graphProvenanceFacts(appendedProvenance).map((fact) => fact.revision),
  [8, 10, 11],
);

const typedFactInput: GraphProvenanceFactInput = {
  source: "author",
  intent: "pinned",
  operation: "typed-pin",
  revision: 12,
};
const typedFact: GraphProvenanceFact = {
  source: "author",
  intent: "pinned",
  operation: "typed-pin-again",
  revision: 13,
};
const typedAppendedProvenance = appendGraphProvenance(appendedProvenance, typedFactInput);
assert.equal(typedAppendedProvenance.revision, 12);
assert.equal(
  appendGraphProvenance(
    typedAppendedProvenance,
    typedFact,
  ).revision,
  13,
);

// These calls are intentionally unreachable: they are compile-time contract
// regressions, while runtime history-property rejection is exercised below.
if (false) {
  // @ts-expect-error GraphProvenanceFactInput must omit history entirely.
  appendGraphProvenance(appendBaseProvenance, {
    source: "author",
    intent: "pinned",
    revision: 11,
    history: undefined,
  });
  const annotatedHistoryUndefinedInput: {
    source: "author";
    intent: "pinned";
    revision: number;
    history: undefined;
  } = {
    source: "author",
    intent: "pinned",
    revision: 11,
    history: undefined,
  };
  // @ts-expect-error Predeclared history: undefined must remain rejected.
  appendGraphProvenance(appendBaseProvenance, annotatedHistoryUndefinedInput);
}

const appendBaseBytesBeforeHistoryRejection = canonicalStringify(appendBaseProvenance);
const ownHistoryNext = {
  source: "author" as const,
  intent: "pinned" as const,
  revision: 11,
  history: [{ ...generatedProvenance(9) }],
} as unknown as GraphProvenanceFactInput;
const inheritedHistoryNext = withInheritedProperty(
  { source: "author" as const, intent: "pinned" as const, revision: 11 },
  "history",
  [{ ...generatedProvenance(9) }],
) as unknown as GraphProvenanceFactInput;
const nonEnumerableHistoryNext = withNonEnumerableProperty(
  { source: "author" as const, intent: "pinned" as const, revision: 11 },
  "history",
  [{ ...generatedProvenance(9) }],
) as unknown as GraphProvenanceFactInput;
for (const historyBearingNext of [ownHistoryNext, inheritedHistoryNext, nonEnumerableHistoryNext]) {
  assert.throws(
    () => appendGraphProvenance(appendBaseProvenance, historyBearingNext),
    /must not contain history/,
  );
  assert.equal(canonicalStringify(appendBaseProvenance), appendBaseBytesBeforeHistoryRejection);
}
for (const revision of [10, 9]) {
  assert.throws(
    () => appendGraphProvenance(appendBaseProvenance, {
      source: "author",
      intent: "pinned",
      revision,
    }),
    /strictly greater/,
  );
}
for (const revision of [Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, -1, 1.5]) {
  assert.throws(
    () => appendGraphProvenance(appendBaseProvenance, {
      source: "author",
      intent: "pinned",
      revision,
    }),
    /finite non-negative integer and a safe integer/,
  );
}

// Persisted collection declarations cannot target a provenance history array,
// including nested entity paths or descendants of that history path.
for (const historyPath of [
  "provenance.history",
  "surface.provenance.history",
  "provenance.history.entries",
  "surface.provenance.history.entries",
]) {
  const historyDocument = {
    ...document,
    provenance: provenanceHistoryA,
    collectionPaths: [historyPath],
  };
  const historyResult = validateGraphDocument(historyDocument);
  assert.equal(historyResult.ok, false, historyPath);
  if (!historyResult.ok) {
    assert.ok(historyResult.errors.some((error) => error.includes("provenance history")), historyPath);
  }
  assert.throws(
    () => serializeGraphDocument(historyDocument),
    /provenance history/,
  );
  await assertFingerprintRejects(historyDocument);
}

// Persisted collectionPaths are authoritative for both validation and
// canonical ordering.  A custom collection must exist, contain unique
// ID-bearing entities, and remain byte-identical when only presentation order
// changes.
const customCollectionA = {
  ...document,
  collectionPaths: ["customNodes"],
  customNodes: [makeNode("custom-b"), makeNode("custom-a")],
};
const customCollectionB = {
  ...document,
  collectionPaths: ["customNodes"],
  customNodes: [makeNode("custom-a"), makeNode("custom-b")],
};
assert.equal(validateGraphDocument(customCollectionA).ok, true);
assert.equal(validateGraphDocument(customCollectionB).ok, true);
assert.equal(serializeGraphDocument(customCollectionA), serializeGraphDocument(customCollectionB));
assert.equal(
  await fingerprintGraph(customCollectionA, { forceFallback: true }),
  await fingerprintGraph(customCollectionB, { forceFallback: true }),
);

// Every public canonical API validates persisted collection declarations before
// it can emit bytes or a hash: a missing path and a non-array terminal fail
// closed, while a nested object-only collection remains valid.
const missingPersistedCollection = { collectionPaths: ["missingNodes"] };
assert.throws(() => canonicalize(missingPersistedCollection), /must exist/);
assert.throws(() => canonicalStringify(missingPersistedCollection), /must exist/);
assert.throws(() => serializeGraph(missingPersistedCollection), /must exist/);
await assertFingerprintRejects(missingPersistedCollection);

const nonArrayPersistedCollection = {
  collectionPaths: ["id"],
  id: { value: "not-an-array" },
};
assert.throws(() => canonicalize(nonArrayPersistedCollection), /must be an array/);
assert.throws(() => canonicalStringify(nonArrayPersistedCollection), /must be an array/);
assert.throws(() => serializeGraph(nonArrayPersistedCollection), /must be an array/);
await assertFingerprintRejects(nonArrayPersistedCollection);

const nestedCanonicalCollectionA = {
  collectionPaths: ["groups.customNodes"],
  groups: { customNodes: [{ id: "nested-b" }, { id: "nested-a" }] },
};
const nestedCanonicalCollectionB = {
  collectionPaths: ["groups.customNodes"],
  groups: { customNodes: [{ id: "nested-a" }, { id: "nested-b" }] },
};
assert.deepEqual(canonicalize(nestedCanonicalCollectionA), canonicalize(nestedCanonicalCollectionB));
assert.equal(canonicalStringify(nestedCanonicalCollectionA), canonicalStringify(nestedCanonicalCollectionB));
assert.equal(serializeGraph(nestedCanonicalCollectionA), serializeGraph(nestedCanonicalCollectionB));
assert.equal(
  await fingerprintGraph(nestedCanonicalCollectionA, { forceFallback: true }),
  await fingerprintGraph(nestedCanonicalCollectionB, { forceFallback: true }),
);

// The persisted collection declaration is itself an unordered set.  Its
// presentation order must not change canonical bytes or fingerprints.
const collectionPathSetA = {
  ...customCollectionA,
  collectionPaths: ["typedEdges", "customNodes"],
};
const collectionPathSetB = {
  ...customCollectionB,
  collectionPaths: ["customNodes", "typedEdges"],
};
assert.equal(validateGraphDocument(collectionPathSetA).ok, true);
assert.equal(validateGraphDocument(collectionPathSetB).ok, true);
assert.equal(serializeGraphDocument(collectionPathSetA), serializeGraphDocument(collectionPathSetB));
assert.equal(
  await fingerprintGraph(collectionPathSetA, { forceFallback: true }),
  await fingerprintGraph(collectionPathSetB, { forceFallback: true }),
);

// A collection may be nested through ordinary object keys; the terminal
// array itself is still presentation-independent.
const nestedCollectionA = {
  ...document,
  collectionPaths: ["groups.customNodes"],
  groups: { customNodes: [makeNode("nested-b"), makeNode("nested-a")] },
};
const nestedCollectionB = {
  ...document,
  collectionPaths: ["groups.customNodes"],
  groups: { customNodes: [makeNode("nested-a"), makeNode("nested-b")] },
};
assert.equal(validateGraphDocument(nestedCollectionA).ok, true);
assert.equal(validateGraphDocument(nestedCollectionB).ok, true);
assert.equal(serializeGraphDocument(nestedCollectionA), serializeGraphDocument(nestedCollectionB));
assert.equal(
  await fingerprintGraph(nestedCollectionA, { forceFallback: true }),
  await fingerprintGraph(nestedCollectionB, { forceFallback: true }),
);

// Persisted collection paths do not address array indices or wildcard/bracket
// expressions.  The same grammar failure is reached before path resolution
// by validation, serialization, and fingerprinting.
for (const invalidCollectionPath of [
  "groups.0.items",
  "groups.0.items.deep",
  "groups[0].items",
  "groups[*].items",
  "groups[].items",
  "groups.*.items",
  "actions.0.items",
  "workflow.actions.0.items",
]) {
  const invalidCollectionPathDocument = {
    ...document,
    collectionPaths: [invalidCollectionPath],
  };
  const invalidCollectionPathResult = validateGraphDocument(invalidCollectionPathDocument);
  assert.equal(invalidCollectionPathResult.ok, false, invalidCollectionPath);
  if (!invalidCollectionPathResult.ok) {
    assert.ok(invalidCollectionPathResult.errors.some((error) =>
      error.includes("dot-separated safe object-key segments"),
    ), invalidCollectionPath);
  }
  assert.throws(
    () => serializeGraphDocument(invalidCollectionPathDocument),
    /dot-separated safe object-key segments/,
  );
  assert.throws(
    () => serializeGraph(invalidCollectionPathDocument),
    /dot-separated safe object-key segments/,
  );
  await assertFingerprintRejects(invalidCollectionPathDocument);
}
for (const orderedPath of ["customNodes", "customNodes.items"]) {
  assert.throws(
    () => canonicalStringify(customCollectionA, { orderedArrayPaths: [orderedPath] }),
    /ordered array path/,
  );
  assert.throws(
    () => serializeGraph(customCollectionA, { orderedArrayPaths: [orderedPath] }),
    /ordered array path/,
  );
  await assertFingerprintRejects(customCollectionA, {
    forceFallback: true,
    orderedArrayPaths: [orderedPath],
  });
}

// A persisted custom collection is authoritative and unordered.  Wrapping it
// as an ordered action collection is a semantic conflict, not an override;
// both presentations must fail before serialization or fingerprinting.
const orderedCustomCollectionA = {
  ...customCollectionA,
  customNodes: asOrderedActionCollection([makeNode("custom-b"), makeNode("custom-a")]),
};
const orderedCustomCollectionB = {
  ...customCollectionA,
  customNodes: asOrderedActionCollection([makeNode("custom-a"), makeNode("custom-b")]),
};
assert.equal(validateGraphDocument(orderedCustomCollectionA).ok, false);
assert.equal(validateGraphDocument(orderedCustomCollectionB).ok, false);
assert.throws(
  () => serializeGraphDocument(orderedCustomCollectionA),
  /ordered action collection marker/,
);
assert.throws(
  () => serializeGraphDocument(orderedCustomCollectionB),
  /ordered action collection marker/,
);
await assertFingerprintRejects(orderedCustomCollectionA);
await assertFingerprintRejects(orderedCustomCollectionB);

const duplicateCustomCollection = {
  ...customCollectionA,
  customNodes: [makeNode("custom-duplicate"), makeNode("custom-duplicate")],
};
const duplicateCustomCollectionResult = validateGraphDocument(duplicateCustomCollection);
assert.equal(duplicateCustomCollectionResult.ok, false);
if (!duplicateCustomCollectionResult.ok) {
  assert.ok(duplicateCustomCollectionResult.errors.some((error) => error.includes("customNodes[1].id duplicates")));
}
assert.equal(
  validateGraphDocument({ ...document, collectionPaths: ["missingCustomNodes"] }).ok,
  false,
);
assert.equal(validateGraphDocument({ ...document, collectionPaths: ["kind"] }).ok, false);
assert.equal(
  validateGraphDocument({ ...document, collectionPaths: ["customNodes", "customNodes"], customNodes: [] }).ok,
  false,
);
const duplicateCollectionPathDocument = {
  ...customCollectionA,
  collectionPaths: ["customNodes", "customNodes"],
};
assert.throws(() => canonicalStringify(duplicateCollectionPathDocument), /must not contain duplicates/);
assert.throws(() => serializeGraph(duplicateCollectionPathDocument), /must not contain duplicates/);
assert.throws(() => serializeGraphDocument(duplicateCollectionPathDocument), /must not contain duplicates/);
await assertFingerprintRejects(duplicateCollectionPathDocument);

// Actions are always chronological.  They are not graph entity collections,
// so declaring an action path as an unordered collection is rejected rather
// than silently changing the meaning of the persisted document.
const actionPathDocumentA = {
  ...document,
  actions: [
    { type: "move", targetId: "node-b" },
    { type: "pin", targetId: "node-a" },
  ],
};
const actionPathDocumentB = {
  ...actionPathDocumentA,
  actions: [...actionPathDocumentA.actions].reverse(),
};
assert.equal(validateGraphDocument(actionPathDocumentA).ok, true);
assert.equal(validateGraphDocument(actionPathDocumentB).ok, true);
assert.notEqual(serializeGraphDocument(actionPathDocumentA), serializeGraphDocument(actionPathDocumentB));
const conflictingActionPathResult = validateGraphDocument({
  ...document,
  collectionPaths: ["actions"],
});
assert.equal(conflictingActionPathResult.ok, false);
if (!conflictingActionPathResult.ok) {
  assert.ok(conflictingActionPathResult.errors.some((error) =>
    error.includes("conflicts with ordered actions") && error.includes("actions"),
  ));
}
assert.throws(
  () => serializeGraphDocument({ ...document, collectionPaths: ["actions"] }),
  /conflicts with ordered actions/,
);
for (const actionDescendantPath of ["actions.items", "actions.items.deep", "workflow.actions.items"]) {
  const actionDescendantDocument = { ...document, collectionPaths: [actionDescendantPath] };
  const actionDescendantResult = validateGraphDocument(actionDescendantDocument);
  assert.equal(actionDescendantResult.ok, false, actionDescendantPath);
  if (!actionDescendantResult.ok) {
    assert.ok(actionDescendantResult.errors.some((error) =>
      error.includes("conflicts with ordered actions") && error.includes(actionDescendantPath),
    ), actionDescendantPath);
  }
  assert.throws(
    () => serializeGraphDocument(actionDescendantDocument),
    /conflicts with ordered actions/,
  );
  await assertFingerprintRejects(actionDescendantDocument);
}

// Public canonical bytes and fingerprints reject values that JSON.stringify
// would coerce, omit, or throw on.  In particular, these invalid array values
// would all collide with [null] under JSON.stringify, so no lossy bytes or
// fingerprints may be produced for them.
for (const invalidValue of [undefined, () => "not JSON", Symbol("not JSON"), Number.NaN, Number.POSITIVE_INFINITY]) {
  const invalidArray = [invalidValue];
  assert.equal(JSON.stringify(invalidArray), JSON.stringify([null]));
  assert.throws(() => canonicalStringify(invalidArray), /must/);
  assert.throws(() => serializeGraph(invalidArray), /must/);
  await assertFingerprintRejects(invalidArray);
}
const invalidBigIntArray = [1n];
assert.throws(() => JSON.stringify(invalidBigIntArray));
assert.throws(() => canonicalStringify(invalidBigIntArray), /JSON primitive/);
assert.throws(() => serializeGraph(invalidBigIntArray), /JSON primitive/);
await assertFingerprintRejects(invalidBigIntArray);

const invalidUndefinedObject = { value: undefined };
assert.throws(() => canonicalStringify(invalidUndefinedObject), /must not be undefined/);
assert.throws(() => serializeGraph(invalidUndefinedObject), /must not be undefined/);
await assertFingerprintRejects(invalidUndefinedObject);

const invalidCycle: Record<string, unknown> = {};
invalidCycle.self = invalidCycle;
assert.throws(() => canonicalStringify(invalidCycle), /cycle/);
assert.throws(() => serializeGraph(invalidCycle), /cycle/);
await assertFingerprintRejects(invalidCycle);

// Strict persistence rejects every value that JSON.stringify would silently
// drop, coerce, or omit, including nested extension facts.  The same
// persistability boundary applies to explicitly relaxed legacy validation.
const undefinedActionDocument = {
  ...document,
  actions: [undefined] as unknown as GraphAuthorAction[],
};
const undefinedActionResult = validateGraphDocument(undefinedActionDocument);
assert.equal(undefinedActionResult.ok, false);
assert.throws(
  () => serializeGraphDocument(undefinedActionDocument as unknown as GraphCoreDocument),
  /must not be undefined/,
);

const undefinedExtensionDocument = {
  ...document,
  extension: { nested: { fact: undefined } },
};
assert.equal(validateGraphDocument(undefinedExtensionDocument).ok, false);
assert.equal(validateGraphDocument(undefinedExtensionDocument, { relaxedLegacyMode: true }).ok, false);
assert.throws(() => serializeGraphDocument(undefinedExtensionDocument), /must not be undefined/);

for (const extensionValue of [
  { callback: () => "not JSON" },
  { token: Symbol("not JSON") },
  { count: 1n },
]) {
  const unsupportedExtensionDocument = { ...document, extension: extensionValue };
  assert.equal(validateGraphDocument(unsupportedExtensionDocument).ok, false);
  assert.throws(() => serializeGraphDocument(unsupportedExtensionDocument));
}

const nonEnumerableExtensionDocument = { ...document };
Object.defineProperty(nonEnumerableExtensionDocument, "extension", {
  configurable: true,
  enumerable: false,
  value: { nested: { value: 1 } },
  writable: true,
});
assert.equal(validateGraphDocument(nonEnumerableExtensionDocument).ok, false);

const inheritedExtensionDocument = withInheritedProperty(
  document,
  "extension",
  { nested: { value: 1 } },
);
assert.equal(validateGraphDocument(inheritedExtensionDocument).ok, false);

const cyclicExtension: Record<string, unknown> = {};
cyclicExtension.self = cyclicExtension;
const cyclicExtensionDocument = { ...document, extension: cyclicExtension };
assert.equal(validateGraphDocument(cyclicExtensionDocument).ok, false);
assert.throws(() => serializeGraphDocument(cyclicExtensionDocument), /cycle/);

// Revision persistence uses safe non-negative integers at every boundary.
const maxSafeRevision = createGraphRevision({}, { revision: Number.MAX_SAFE_INTEGER });
assert.equal(maxSafeRevision.revision, Number.MAX_SAFE_INTEGER);
assert.throws(() => advanceGraphRevision(maxSafeRevision, {}), /cannot advance revision/);

const preMaxSafeRevision = createGraphRevision({}, { revision: Number.MAX_SAFE_INTEGER - 1 });
const finalSafeRevision = advanceGraphRevision(preMaxSafeRevision, {});
assert.equal(finalSafeRevision.revision, Number.MAX_SAFE_INTEGER);
assert.deepEqual(finalSafeRevision.lineage, [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER]);
assert.throws(() => advanceGraphRevision(finalSafeRevision, {}), /cannot advance revision/);

for (const unsafeStartRevision of [
  Number.MAX_SAFE_INTEGER + 1,
  Number.POSITIVE_INFINITY,
  Number.NaN,
  -1,
  1.5,
]) {
  assert.throws(() => createGraphRevision({}, { revision: unsafeStartRevision }));
}
const inheritedStartOptions = Object.create({ revision: 1 }) as { revision?: number };
assert.throws(() => createGraphRevision({}, inheritedStartOptions));

const unsafeCurrentRevision = {
  revision: Number.MAX_SAFE_INTEGER + 1,
  parentRevision: null,
  lineage: [Number.MAX_SAFE_INTEGER + 1],
  value: {},
};
assert.throws(() => advanceGraphRevision(unsafeCurrentRevision, {}), /finite non-negative integer/);

const unsafeParentDocument = {
  ...document,
  parentRevision: Number.MAX_SAFE_INTEGER + 1,
};
assert.equal(validateGraphDocument(unsafeParentDocument).ok, false);

const unsafeLineageDocument = {
  ...document,
  lineage: [0, Number.MAX_SAFE_INTEGER + 1],
};
assert.equal(validateGraphDocument(unsafeLineageDocument).ok, false);

const unsafeProvenanceDocument = {
  ...document,
  provenance: generatedProvenance(Number.MAX_SAFE_INTEGER + 1),
};
assert.equal(validateGraphDocument(unsafeProvenanceDocument).ok, false);

const unsafeActionDocument = {
  ...document,
  actions: [{ type: "move", revision: Number.MAX_SAFE_INTEGER + 1 }],
};
assert.equal(validateGraphDocument(unsafeActionDocument).ok, false);

// Valid graph documents serialize and parse without losing canonical facts.
const serialized = serializeGraphDocument(document, { validation: typedEdgeValidation });
const parsed = parseGraphDocument<typeof document>(serialized, typedEdgeValidation);
assert.equal(serializeGraphDocument(parsed, { validation: typedEdgeValidation }), serialized);
assert.deepEqual(parsed, JSON.parse(serialized));

// Strict persistence must not accept required facts that canonical JSON would
// omit or resolve through a prototype.  The checks cover the document,
// metadata, provenance history, revision lineage, collection paths, and an
// opted-in endpoint selector.
const inheritedDocumentId = withInheritedProperty(document, "id", document.id);
const inheritedDocumentIdResult = validateGraphDocument(inheritedDocumentId, typedEdgeValidation);
assert.equal(inheritedDocumentIdResult.ok, false);
assert.throws(() => serializeGraphDocument(inheritedDocumentId, { validation: typedEdgeValidation }));

const nonEnumerableDocumentRevision = withNonEnumerableProperty(document, "revision", document.revision);
const nonEnumerableDocumentRevisionResult = validateGraphDocument(
  nonEnumerableDocumentRevision,
  typedEdgeValidation,
);
assert.equal(nonEnumerableDocumentRevisionResult.ok, false);
assert.throws(() => serializeGraphDocument(
  nonEnumerableDocumentRevision,
  { validation: typedEdgeValidation },
));

const inheritedLifecycleNode = withInheritedProperty(makeNode("node-inherited-lifecycle"), "lifecycle", "confirmed");
const inheritedLifecycleDocument = {
  ...document,
  nodes: [inheritedLifecycleNode],
  edges: [],
  typedEdges: [],
};
const inheritedLifecycleResult = validateGraphDocument(inheritedLifecycleDocument);
assert.equal(inheritedLifecycleResult.ok, false);
assert.throws(() => serializeGraphDocument(inheritedLifecycleDocument));

const nonEnumerableHistoryRevision = withNonEnumerableProperty(
  generatedProvenance(0),
  "revision",
  0,
);
const nonEnumerableHistoryDocument = {
  ...document,
  provenance: {
    ...generatedProvenance(1),
    history: [nonEnumerableHistoryRevision],
  },
};
const nonEnumerableHistoryResult = validateGraphDocument(nonEnumerableHistoryDocument);
assert.equal(nonEnumerableHistoryResult.ok, false);
assert.throws(() => serializeGraphDocument(nonEnumerableHistoryDocument));

const nonEnumerableLineage = [0, 1];
Object.defineProperty(nonEnumerableLineage, 0, {
  configurable: true,
  enumerable: false,
  value: 0,
  writable: true,
});
const nonEnumerableLineageDocument = { ...document, lineage: nonEnumerableLineage };
const nonEnumerableLineageResult = validateGraphDocument(nonEnumerableLineageDocument);
assert.equal(nonEnumerableLineageResult.ok, false);
assert.throws(() => serializeGraphDocument(nonEnumerableLineageDocument));

const nonEnumerableCollectionPath = ["typedEdges"];
Object.defineProperty(nonEnumerableCollectionPath, 0, {
  configurable: true,
  enumerable: false,
  value: "typedEdges",
  writable: true,
});
const nonEnumerableCollectionPathDocument = {
  ...document,
  collectionPaths: nonEnumerableCollectionPath,
};
const nonEnumerableCollectionPathResult = validateGraphDocument(nonEnumerableCollectionPathDocument);
assert.equal(nonEnumerableCollectionPathResult.ok, false);
assert.throws(() => serializeGraphDocument(nonEnumerableCollectionPathDocument));

const inheritedEndpointRecord = withInheritedProperty(
  makeEdge("inherited-endpoint", "node-a", "node-b"),
  "from",
  "node-a",
);
const inheritedEndpointResult = validateGraphEndpointRecord(inheritedEndpointRecord);
assert.equal(inheritedEndpointResult.some((error) => error.includes("from must be an own property")), true);

const nonEnumerableSelectedEndpointDocument = {
  ...document,
  typedEdges: [makeTypedEdge("typed-non-enumerable-endpoint", "node-a", "node-b")],
};
const nonEnumerableSelectedEndpointValidation = {
  ...typedEdgeValidation,
  typedEdgeDescriptors: [{
    collectionPath: "typedEdges",
    endpointSelector: () => {
      const pair = { from: "node-a", to: "node-b" };
      Object.defineProperty(pair, "from", {
        configurable: true,
        enumerable: false,
        value: "node-a",
        writable: true,
      });
      return pair;
    },
  }],
};
const nonEnumerableSelectedEndpointResult = validateGraphDocument(
  nonEnumerableSelectedEndpointDocument,
  nonEnumerableSelectedEndpointValidation,
);
assert.equal(nonEnumerableSelectedEndpointResult.ok, false);
assert.throws(() => serializeGraphDocument(
  nonEnumerableSelectedEndpointDocument,
  { validation: nonEnumerableSelectedEndpointValidation },
));

// Strict validation is the default: every declared node and edge needs a
// stable id plus the complete Graph Core metadata envelope.
const missingEntityFacts = {
  ...document,
  nodes: [{}],
  edges: [{}],
  typedEdges: [],
};
const missingEntityResult = validateGraphDocument(missingEntityFacts);
assert.equal(missingEntityResult.ok, false);
if (!missingEntityResult.ok) {
  assert.ok(missingEntityResult.errors.some((error) => error.includes("nodes[0].id")));
  assert.ok(missingEntityResult.errors.some((error) => error.includes("edges[0].id")));
  assert.ok(missingEntityResult.errors.some((error) => error.includes("revision")));
  assert.ok(missingEntityResult.errors.some((error) => error.includes("lifecycle")));
  assert.ok(missingEntityResult.errors.some((error) => error.includes("provenance")));
}
const missingMetadata = {
  ...document,
  nodes: [{ id: "node-only" }],
  edges: [{ id: "edge-only", from: "node-only", to: "node-only" }],
  typedEdges: [],
};
const missingMetadataResult = validateGraphDocument(missingMetadata);
assert.equal(missingMetadataResult.ok, false);

// Strict documents require parentRevision as an own Core metadata field.  An
// explicitly relaxed legacy parse may preserve older records that omit it.
const missingParentNode = makeNode("node-no-parent");
delete missingParentNode.parentRevision;
const missingParentEdge = makeEdge("edge-no-parent", "node-no-parent", "node-no-parent");
delete missingParentEdge.parentRevision;
const missingParentDocument = {
  ...document,
  nodes: [missingParentNode],
  edges: [missingParentEdge],
  typedEdges: [],
};
const strictMissingParentResult = validateGraphDocument(missingParentDocument);
assert.equal(strictMissingParentResult.ok, false);
if (!strictMissingParentResult.ok) {
  assert.ok(strictMissingParentResult.errors.some((error) => error.includes(
    "nodes[0].parentRevision must be an own property",
  )));
  assert.ok(strictMissingParentResult.errors.some((error) => error.includes(
    "edges[0].parentRevision must be an own property",
  )));
}
assert.equal(validateGraphDocument(missingParentDocument, { relaxedLegacyMode: true }).ok, true);

const undefinedParentNode = makeNode("node-undefined-parent");
undefinedParentNode.parentRevision = undefined;
const undefinedParentDocument = {
  ...document,
  nodes: [undefinedParentNode],
  edges: [],
  typedEdges: [],
};
const undefinedParentResult = validateGraphDocument(undefinedParentDocument);
assert.equal(undefinedParentResult.ok, false);
if (!undefinedParentResult.ok) {
  assert.ok(undefinedParentResult.errors.some((error) => error.includes(
    "nodes[0].parentRevision must be null or a finite non-negative integer",
  )));
}
const relaxedUndefinedParentResult = validateGraphDocument(undefinedParentDocument, { relaxedLegacyMode: true });
assert.equal(relaxedUndefinedParentResult.ok, false);
if (!relaxedUndefinedParentResult.ok) {
  assert.ok(relaxedUndefinedParentResult.errors.some((error) => error.includes(
    "parentRevision must not be undefined when present",
  )));
}
assert.throws(() => serializeGraphDocument(
  undefinedParentDocument,
  { validation: { relaxedLegacyMode: true } },
));

// Legacy relaxation is an explicit, named opt-in rather than an accidental
// consequence of omitted require-* flags.
const legacyMinimal = {
  ...document,
  nodes: [{ id: "legacy-node" }],
  edges: [{ id: "legacy-edge", from: "legacy-node", to: "missing-node" }],
  typedEdges: [],
};
assert.equal(validateGraphDocument(legacyMinimal, { relaxedLegacyMode: true }).ok, true);

// Revision lineage has one coherent root/non-root shape: a root has exactly
// one entry and a null parent; every non-root has a parent that is the
// penultimate lineage entry.  Entries are unique and strictly increasing.
const rootLineageWithParent = {
  ...document,
  revision: 1,
  parentRevision: 0,
  lineage: [1],
};
const rootLineageWithParentResult = validateGraphDocument(rootLineageWithParent);
assert.equal(rootLineageWithParentResult.ok, false);
if (!rootLineageWithParentResult.ok) {
  assert.ok(rootLineageWithParentResult.errors.some((error) => error.includes(
    "parentRevision must be null for a root lineage",
  )));
}

const nonRootWithoutParent = {
  ...document,
  revision: 1,
  parentRevision: null,
  lineage: [0, 1],
};
const nonRootWithoutParentResult = validateGraphDocument(nonRootWithoutParent);
assert.equal(nonRootWithoutParentResult.ok, false);
if (!nonRootWithoutParentResult.ok) {
  assert.ok(nonRootWithoutParentResult.errors.some((error) => error.includes(
    "parentRevision must be non-null for a non-root lineage",
  )));
}

const wrongPenultimateParent = {
  ...document,
  revision: 2,
  parentRevision: 0,
  lineage: [0, 1, 2],
};
const wrongPenultimateParentResult = validateGraphDocument(wrongPenultimateParent);
assert.equal(wrongPenultimateParentResult.ok, false);
if (!wrongPenultimateParentResult.ok) {
  assert.ok(wrongPenultimateParentResult.errors.some((error) => error.includes(
    "lineage penultimate entry must equal parentRevision",
  )));
}

const emptyLineage = {
  ...document,
  lineage: [],
};
const emptyLineageResult = validateGraphDocument(emptyLineage);
assert.equal(emptyLineageResult.ok, false);
if (!emptyLineageResult.ok) {
  assert.ok(emptyLineageResult.errors.some((error) => error.includes("lineage must not be empty")));
}

const lineageEndingAtWrongRevision = {
  ...document,
  revision: 2,
  parentRevision: 1,
  lineage: [0, 1, 3],
};
const lineageEndingAtWrongRevisionResult = validateGraphDocument(lineageEndingAtWrongRevision);
assert.equal(lineageEndingAtWrongRevisionResult.ok, false);
if (!lineageEndingAtWrongRevisionResult.ok) {
  assert.ok(lineageEndingAtWrongRevisionResult.errors.some((error) => error.includes(
    "lineage must end at revision",
  )));
}

const duplicateLineage = {
  ...document,
  revision: 2,
  parentRevision: 1,
  lineage: [0, 1, 1, 2],
};
const duplicateLineageResult = validateGraphDocument(duplicateLineage);
assert.equal(duplicateLineageResult.ok, false);
if (!duplicateLineageResult.ok) {
  assert.ok(duplicateLineageResult.errors.some((error) => error.includes("lineage must be strictly increasing")));
}

const nonMonotonicLineage = {
  ...document,
  revision: 3,
  parentRevision: 2,
  lineage: [0, 2, 1, 3],
};
const nonMonotonicLineageResult = validateGraphDocument(nonMonotonicLineage);
assert.equal(nonMonotonicLineageResult.ok, false);
if (!nonMonotonicLineageResult.ok) {
  assert.ok(nonMonotonicLineageResult.errors.some((error) => error.includes(
    "lineage must be strictly increasing",
  )));
}

// Malformed lifecycle is rejected closed.
const badLifecycle = { ...document, lifecycle: "pending" };
const badLifecycleResult = validateGraphDocument(badLifecycle, typedEdgeValidation);
assert.equal(badLifecycleResult.ok, false);
if (!badLifecycleResult.ok) assert.ok(badLifecycleResult.errors.some((error) => error.includes("lifecycle")));

// Duplicate entity IDs are rejected across declared graph collections.
const duplicateIds = {
  ...document,
  nodes: [makeNode("same"), makeNode("same")],
};
const duplicateResult = validateGraphDocument(duplicateIds, typedEdgeValidation);
assert.equal(duplicateResult.ok, false);
if (!duplicateResult.ok) assert.ok(duplicateResult.errors.some((error) => error.includes("duplicates")));

// Caller-owned typed edge endpoint descriptors are checked without assigning
// a semantic meaning to the edge.
const danglingEdges = {
  ...document,
  typedEdges: [{ id: "typed-dangling", source: "node-a", target: "missing-node" }],
};
const danglingResult = validateGraphDocument(danglingEdges, typedEdgeValidation);
assert.equal(danglingResult.ok, false);
if (!danglingResult.ok) assert.ok(danglingResult.errors.some((error) => error.includes("dangling endpoint")));

// A generic from/to-shaped record remains semantic-neutral unless the owning
// layer opts into endpoint validation with its typed selector.
const neutralEdgeDocument = {
  ...document,
  edges: [{
    ...makeEdge("note", "node-a", "not-a-node"),
    meaning: "caller-owned",
  }],
};
assert.equal(validateGraphDocument(neutralEdgeDocument).ok, true);
const optedInNeutralEdgeResult = validateGraphDocument(neutralEdgeDocument, {
  edgeEndpointSelector: (edge: { from: string; to: string }) => ({ from: edge.from, to: edge.to }),
});
assert.equal(optedInNeutralEdgeResult.ok, false);
if (!optedInNeutralEdgeResult.ok) {
  assert.ok(optedInNeutralEdgeResult.errors.some((error) => error.includes("dangling endpoint")));
}

// Non-finite numeric facts fail validation before canonical JSON could turn
// them into misleading null values.
const nonFinite = {
  ...document,
  diagnostic: { score: Number.NaN },
};
const nonFiniteResult = validateGraphDocument(nonFinite, typedEdgeValidation);
assert.equal(nonFiniteResult.ok, false);
if (!nonFiniteResult.ok) assert.ok(nonFiniteResult.errors.some((error) => error.includes("must be finite")));

// __proto__ is a valid JSON own key.  It must remain data, not trigger the
// Object.prototype setter, across cloning, serialization, parsing, and hashing.
const protoSource = ownProtoRecord({ nested: { value: 1 } });
const protoRevision = createGraphRevision(protoSource);
const clonedProto = protoRevision.value as Record<string, unknown>;
assert.equal(Object.prototype.hasOwnProperty.call(clonedProto, "__proto__"), true);
assert.equal(
  ((clonedProto["__proto__"] as Record<string, unknown>).nested as Record<string, unknown>).value,
  1,
);
const protoDocumentA = {
  ...document,
  diagnostic: ownProtoRecord({ value: 1 }),
} as typeof document;
const protoDocumentB = {
  ...document,
  diagnostic: ownProtoRecord({ value: 2 }),
} as typeof document;
const protoBytesA = serializeGraphDocument(protoDocumentA, { validation: typedEdgeValidation });
const protoBytesB = serializeGraphDocument(protoDocumentB, { validation: typedEdgeValidation });
assert.ok(protoBytesA.includes('"__proto__"'));
assert.notEqual(protoBytesA, protoBytesB);
const parsedProto = parseGraphDocument<typeof document>(protoBytesA, typedEdgeValidation) as typeof document & {
  diagnostic: Record<string, unknown>;
};
assert.equal(Object.prototype.hasOwnProperty.call(parsedProto.diagnostic, "__proto__"), true);
assert.equal(
  (parsedProto.diagnostic["__proto__"] as Record<string, unknown>).value,
  1,
);
assert.notEqual(
  await fingerprintGraph(protoDocumentA, { forceFallback: true }),
  await fingerprintGraph(protoDocumentB, { forceFallback: true }),
);

// The dependency-free SHA-256 path succeeds explicitly without WebCrypto.
assert.equal(
  await sha256Hex("abc", { forceFallback: true }),
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
);
const fallbackFingerprint = await fingerprintGraph(document, { forceFallback: true });
assert.match(fallbackFingerprint, /^[0-9a-f]{64}$/);

console.log("graphCore.test.ts: all assertions passed");

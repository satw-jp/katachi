// ---------------------------------------------------------------------------
// SKIN Artwork Graph — the semantic container for Surface, Interior, and
// Artwork Connection facts.
//
// This file deliberately stops at graph facts. It does not generate geometry,
// invoke the runtime/UI, or touch the existing Skin history schema. Integration
// candidates are immutable alternatives to the active snapshot; accepting one
// is the only operation that can replace the active confirmed facts.
// ---------------------------------------------------------------------------

import {
  appendGraphProvenance,
  asGraphEntityCollection,
  assertGraphValid,
  canonicalStringify,
  cloneGraphValue,
  fingerprintGraph,
  graphProvenanceFacts,
  GraphValidationError,
  isSafeNonNegativeInteger,
  parseGraphJson,
  validateFiniteNumbers,
  validateGraphEndpointRecord,
  validateGraphMetadata,
  validateRevisionLineage,
  type GraphLifecycle,
  type GraphProvenance,
  type GraphProvenanceFact,
  type GraphRecordMetadata,
  type GraphValidationResult,
} from "./graphCore.ts";
import {
  assertValidSurfaceGraph,
  validateSurfaceGraph,
  type SurfaceGraph,
} from "./surfaceGraph.ts";

export type ArtworkGraphState =
  | "surfaceDraft"
  | "integrationCandidate"
  | "integratedConfirmed";

export interface InteriorStrutNode extends GraphRecordMetadata {
  nodeType: "interior-strut-node";
  parentRevision: number | null;
  position: { x: number; y: number; z: number };
  radius: number;
}

/** Interior structure is a printable artwork fact, not a Surface relation. */
export interface InteriorStrutEdge extends GraphRecordMetadata {
  edgeType: "interior-strut";
  parentRevision: number | null;
  from: string;
  to: string;
  radius: number;
}

export interface InteriorGraph {
  kind: "interior-graph";
  nodes: InteriorStrutNode[];
  edges: InteriorStrutEdge[];
}

/** A typed Surface→Interior relation, distinct from both edge kinds above. */
export interface ArtworkConnection extends GraphRecordMetadata {
  edgeType: "artwork-connection";
  parentRevision: number | null;
  connectionKind: "surface-to-interior";
  surfaceNodeId: string;
  interiorNodeId: string;
  from: string;
  to: string;
  radius: number;
}

export interface ArtworkSnapshot {
  surface: SurfaceGraph;
  interior: InteriorGraph;
  connections: ArtworkConnection[];
}

export interface IntegratedConfirmedArtwork extends ArtworkSnapshot, GraphRecordMetadata {
  kind: "artwork-confirmed-snapshot";
  schemaVersion: 1;
  parentRevision: number | null;
  lineage: readonly number[];
  sourceCandidateId: string;
}

export interface ArtworkIntegrationCandidate extends ArtworkSnapshot, GraphRecordMetadata {
  kind: "artwork-integration-candidate";
  schemaVersion: 1;
  parentRevision: number | null;
  lineage: readonly number[];
  candidateId: string;
  /** Immutable generation revision, retained across lifecycle transitions. */
  candidateRevision: number;
  /** Revision of the active snapshot used as the candidate base. */
  baseRevision: number;
  baseFingerprint: string;
  inputFingerprint: string;
  generator: string;
  algorithmVersion: string;
  unresolvedFacts: string[];
}

export interface ArtworkGraph extends GraphRecordMetadata {
  kind: "artwork-graph";
  schemaVersion: 1;
  parentRevision: number | null;
  lineage: readonly number[];
  state: ArtworkGraphState;
  /** Explicit slots.  There is no duplicate top-level active snapshot. */
  surfaceDraft: SurfaceGraph;
  integrationCandidates: ArtworkIntegrationCandidate[];
  integratedConfirmed: IntegratedConfirmedArtwork | null;
}

export type ArtworkGraphSnapshot = ArtworkSnapshot;
export type ArtworkConfirmedSnapshot = IntegratedConfirmedArtwork;
export type IntegrationCandidate = ArtworkIntegrationCandidate;

export interface ArtworkGraphOptions {
  id?: string;
  revision?: number;
  provenance?: GraphProvenance;
  /**
   * Compatibility spelling retained for callers of the interrupted packet.
   * New containers can only start in surfaceDraft; acceptance is explicit.
   */
  state?: ArtworkGraphState;
}

export interface IntegrationCandidateInput {
  /** A generator may return a new Surface snapshot; the active one is default. */
  surface?: SurfaceGraph;
  interior: InteriorGraph;
  connections?: readonly ArtworkConnection[];
  unresolvedFacts?: readonly string[];
}

export interface IntegrationCandidateOptions {
  candidateId?: string;
  revision?: number;
  generator?: string;
  algorithmVersion?: string;
  inputFingerprint?: string;
  unresolvedFacts?: readonly string[];
}

const ARTWORK_CANONICAL_OPTIONS = {
  entityCollectionPaths: [
    "surfaceDraft.nodes",
    "surfaceDraft.edges",
    "integrationCandidates",
    "integratedConfirmed.surface.nodes",
    "integratedConfirmed.surface.edges",
  ],
  sortGraphEntityCollections: true,
} as const;

function generatedProvenance(
  inputFingerprint: string,
  operation: string,
  revision: number,
  generator = "artwork-graph",
  algorithmVersion = "artwork-graph-v1",
): GraphProvenance {
  return {
    source: "generated",
    intent: "generated",
    generator,
    algorithmVersion,
    inputFingerprint,
    operation,
    revision,
  };
}

/**
 * Keep the persisted candidate shape compatible while binding every
 * generation fact to the immutable candidate identity.  `operation` remains
 * a Graph Core string, but its suffix is a canonical JSON payload containing
 * the candidate id/revision, generator inputs, base and generated snapshots,
 * and their fingerprints.  This lets later author lifecycle facts retain a
 * verifiable generated predecessor without adding required schema fields.
 */
interface CandidateGeneratedPayload {
  candidateId: string;
  candidateRevision: number;
  parentRevision: number;
  baseRevision: number;
  baseFingerprint: string;
  baseSnapshot: ArtworkSnapshot;
  baseSnapshotFingerprint: string;
  inputFingerprint: string;
  generator: string;
  algorithmVersion: string;
  snapshot: ArtworkSnapshot;
  snapshotFingerprint: string;
  unresolvedFacts: string[];
}

function candidateGeneratedOperation(
  candidateId: string,
  candidateRevision: number,
  parentRevision: number,
  baseRevision: number,
  baseFingerprint: string,
  baseSnapshot: ArtworkSnapshot,
  inputFingerprint: string,
  generator: string,
  algorithmVersion: string,
  snapshot: ArtworkSnapshot,
  unresolvedFacts: readonly string[],
): string {
  const payload: CandidateGeneratedPayload = {
    candidateId,
    candidateRevision,
    parentRevision,
    baseRevision,
    baseFingerprint,
    baseSnapshot: canonicalSnapshotValue(baseSnapshot),
    baseSnapshotFingerprint: snapshotFingerprint(baseSnapshot),
    inputFingerprint,
    generator,
    algorithmVersion,
    snapshot: canonicalSnapshotValue(snapshot),
    snapshotFingerprint: snapshotFingerprint(snapshot),
    unresolvedFacts: [...unresolvedFacts],
  };
  return "integration-candidate:" + canonicalStringify(payload);
}

interface CandidateGeneratedEvidence {
  fact: GraphProvenanceFact;
  payload: CandidateGeneratedPayload;
}

interface CandidateGeneratedEvidenceResult {
  evidence: CandidateGeneratedEvidence | null;
  errors: string[];
}

const CANDIDATE_OPERATION_PREFIX = "integration-candidate:";

function parseCandidateGeneratedOperation(
  operation: unknown,
  path: string,
): { payload: CandidateGeneratedPayload | null; errors: string[] } {
  const errors: string[] = [];
  if (typeof operation !== "string" || !operation.startsWith(CANDIDATE_OPERATION_PREFIX)) {
    return {
      payload: null,
      errors: [path + " must be an integration-candidate operation"],
    };
  }

  let parsed: unknown;
  try {
    parsed = parseGraphJson(operation.slice(CANDIDATE_OPERATION_PREFIX.length));
  } catch (error) {
    return {
      payload: null,
      errors: [
        path + " has invalid integration-candidate payload: " +
          (error instanceof Error ? error.message : "invalid JSON"),
      ],
    };
  }
  if (!isRecord(parsed)) {
    return {
      payload: null,
      errors: [path + " payload must be an object"],
    };
  }

  errors.push(...requiredOwnDataFields(parsed, [
    "candidateId", "candidateRevision", "parentRevision", "baseRevision", "baseFingerprint",
    "baseSnapshot", "baseSnapshotFingerprint", "inputFingerprint", "generator", "algorithmVersion",
    "snapshot", "snapshotFingerprint", "unresolvedFacts",
  ], path + ".payload"));
  const payload = parsed as Partial<CandidateGeneratedPayload>;
  errors.push(...requireNonEmptyString(payload.candidateId, path + ".payload.candidateId"));
  for (const field of ["baseFingerprint", "baseSnapshotFingerprint", "inputFingerprint", "generator",
    "algorithmVersion", "snapshotFingerprint"] as const) {
    errors.push(...requireNonEmptyString(payload[field], path + ".payload." + field));
  }
  for (const field of ["candidateRevision", "parentRevision", "baseRevision"] as const) {
    if (!isSafeNonNegativeInteger(payload[field])) {
      errors.push(path + ".payload." + field + " must be a finite non-negative safe integer");
    }
  }
  const baseSnapshotErrors = validateArtworkSnapshot(payload.baseSnapshot, path + ".payload.baseSnapshot");
  const snapshotErrors = validateArtworkSnapshot(payload.snapshot, path + ".payload.snapshot");
  errors.push(...baseSnapshotErrors, ...snapshotErrors);
  if (!Array.isArray(payload.unresolvedFacts)) {
    errors.push(path + ".payload.unresolvedFacts must be an array");
  } else {
    for (let index = 0; index < payload.unresolvedFacts.length; index += 1) {
      if (!hasOwnEnumerableDataProperty(payload.unresolvedFacts, index)) {
        errors.push(path + ".payload.unresolvedFacts[" + index + "] must be an own enumerable data property");
      } else if (typeof payload.unresolvedFacts[index] !== "string" || payload.unresolvedFacts[index].length === 0) {
        errors.push(path + ".payload.unresolvedFacts[" + index + "] must be a non-empty string");
      }
    }
  }

  if (baseSnapshotErrors.length === 0 && typeof payload.baseSnapshotFingerprint === "string") {
    try {
      if (snapshotFingerprint(payload.baseSnapshot as ArtworkSnapshot) !== payload.baseSnapshotFingerprint) {
        errors.push(path + ".payload.baseSnapshotFingerprint does not match baseSnapshot");
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : path + ".payload.baseSnapshot is not fingerprintable");
    }
  }
  if (snapshotErrors.length === 0 && typeof payload.snapshotFingerprint === "string") {
    try {
      if (snapshotFingerprint(payload.snapshot as ArtworkSnapshot) !== payload.snapshotFingerprint) {
        errors.push(path + ".payload.snapshotFingerprint does not match snapshot");
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : path + ".payload.snapshot is not fingerprintable");
    }
  }

  if (errors.length === 0) {
    try {
      if (canonicalStringify(parsed) !== operation.slice(CANDIDATE_OPERATION_PREFIX.length)) {
        errors.push(path + " payload must use canonical JSON ordering");
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : path + " payload is not persistable JSON");
    }
  }
  return {
    payload: errors.length === 0 ? parsed as unknown as CandidateGeneratedPayload : null,
    errors,
  };
}

function candidateGeneratedEvidence(
  candidate: Partial<ArtworkIntegrationCandidate>,
  path: string,
): CandidateGeneratedEvidenceResult {
  const errors: string[] = [];
  if (!candidate.provenance || !isRecord(candidate.provenance)) {
    return { evidence: null, errors };
  }
  let facts: GraphProvenanceFact[];
  try {
    facts = graphProvenanceFacts(candidate.provenance);
  } catch (error) {
    return {
      evidence: null,
      errors: [path + ".provenance cannot expose its generated history: " +
        (error instanceof Error ? error.message : "invalid provenance")],
    };
  }
  const generatedFacts = facts.filter((fact) => fact.source === "generated" && fact.intent === "generated");
  if (generatedFacts.length === 0) {
    return {
      evidence: null,
      errors: [path + ".provenance must retain a generated integration-candidate fact"],
    };
  }
  if (generatedFacts.length !== 1) {
    errors.push(path + ".provenance must retain exactly one generated integration-candidate fact");
  }
  const fact = generatedFacts[0];
  const parsed = parseCandidateGeneratedOperation(fact.operation, path + ".provenance.generated.operation");
  errors.push(...parsed.errors);
  if (!parsed.payload) return { evidence: null, errors };
  const payload = parsed.payload;
  if (payload.candidateId !== candidate.candidateId) {
    errors.push(path + ".provenance.generated payload candidateId must match candidate.candidateId");
  }
  for (const field of ["generator", "algorithmVersion", "inputFingerprint"] as const) {
    if (payload[field] !== candidate[field]) {
      errors.push(path + ".provenance.generated payload " + field + " must match candidate." + field);
    }
    if (fact[field] !== candidate[field]) {
      errors.push(path + ".provenance.generated " + field + " must match candidate." + field);
    }
  }
  if (fact.revision !== candidate.candidateRevision) {
    errors.push(path + ".provenance.generated revision must match candidateRevision");
  }
  if (payload.candidateRevision !== candidate.candidateRevision) {
    errors.push(path + ".provenance.generated payload candidateRevision must match candidate.candidateRevision");
  }
  const candidateRevisionIndex = Array.isArray(candidate.lineage)
    ? candidate.lineage.indexOf(payload.candidateRevision)
    : -1;
  if (candidateRevisionIndex <= 0 ||
    candidate.lineage?.[candidateRevisionIndex - 1] !== payload.parentRevision) {
    errors.push(path + ".provenance.generated payload parentRevision must match the candidate lineage predecessor");
  }
  if (payload.baseRevision !== candidate.baseRevision) {
    errors.push(path + ".provenance.generated payload baseRevision must match candidate.baseRevision");
  }
  if (payload.baseFingerprint !== candidate.baseFingerprint) {
    errors.push(path + ".provenance.generated payload baseFingerprint must match candidate.baseFingerprint");
  }
  if (payload.baseFingerprint !== payload.baseSnapshotFingerprint) {
    errors.push(path + ".provenance.generated baseFingerprint must match baseSnapshotFingerprint");
  }
  if (Array.isArray(candidate.unresolvedFacts)) {
    try {
      if (canonicalStringify(payload.unresolvedFacts) !== canonicalStringify(candidate.unresolvedFacts)) {
        errors.push(path + ".provenance.generated unresolvedFacts must match candidate.unresolvedFacts");
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : path + ".unresolvedFacts is not canonical");
    }
  }
  try {
    const expectedOperation = candidateGeneratedOperation(
      payload.candidateId,
      payload.candidateRevision,
      payload.parentRevision,
      payload.baseRevision,
      payload.baseFingerprint,
      payload.baseSnapshot,
      payload.inputFingerprint,
      payload.generator,
      payload.algorithmVersion,
      payload.snapshot,
      payload.unresolvedFacts,
    );
    if (fact.operation !== expectedOperation) {
      errors.push(path + ".provenance.generated operation does not match immutable candidate facts");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : path + ".provenance.generated operation is not canonical");
  }

  if (candidate.lifecycle === "candidate" || candidate.lifecycle === "rejected" || candidate.lifecycle === "stale") {
    try {
      if (snapshotFingerprint(candidate as unknown as ArtworkSnapshot) !== payload.snapshotFingerprint) {
        errors.push(path + ".snapshot does not match immutable generated snapshot");
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : path + ".snapshot is not fingerprintable");
    }
  } else if (candidate.lifecycle === "confirmed" && isSafeNonNegativeInteger(candidate.revision)) {
    try {
      const promoted = promoteSnapshot(payload.snapshot, candidate.revision);
      if (snapshotFingerprint(candidate as unknown as ArtworkSnapshot) !== snapshotFingerprint(promoted)) {
        errors.push(path + ".snapshot does not match the immutable generated snapshot promoted at confirmation");
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : path + ".confirmed snapshot is not fingerprintable");
    }
  }
  return {
    evidence: { fact, payload },
    errors,
  };
}

function assertRevision(value: unknown, path: string): number {
  if (!isSafeNonNegativeInteger(value)) {
    throw new GraphValidationError([
      path + " must be a finite non-negative integer and safe integer",
    ]);
  }
  return value;
}

function nextRevision(source: Pick<ArtworkGraph, "revision">): number {
  if (source.revision >= Number.MAX_SAFE_INTEGER) {
    throw new GraphValidationError(["cannot advance artwork graph beyond Number.MAX_SAFE_INTEGER"]);
  }
  return assertRevision(source.revision + 1, "next artwork graph revision");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwnEnumerableDataProperty(value: unknown, key: string | number): boolean {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined &&
    descriptor.enumerable === true &&
    Object.prototype.hasOwnProperty.call(descriptor, "value");
}

/**
 * Graph Core keeps the strict JSON walk behind its canonical API.  Artwork
 * validation must invoke that walk on the caller's original object before any
 * semantic clone/normalization, otherwise inherited, descriptor-only, symbol,
 * lossy, or cyclic facts could disappear in a defensive copy first.
 */
const STRICT_BOUNDARY_CANONICAL_OPTIONS = {
  entityCollectionPaths: [],
  sortGraphEntityCollections: false,
} as const;

function strictJsonBoundaryErrors(value: unknown): string[] {
  try {
    // canonicalStringify invokes Graph Core's strict persistability validator
    // before canonicalization. Empty collection paths keep this check
    // independent from Artwork's semantic ordering declarations.
    canonicalStringify(value, STRICT_BOUNDARY_CANONICAL_OPTIONS);
    return [];
  } catch (error) {
    if (error instanceof GraphValidationError) return [...error.errors];
    return [error instanceof Error ? error.message : "value is not strict JSON"];
  }
}

function assertStrictJsonBoundary(value: unknown, label: string): void {
  const errors = strictJsonBoundaryErrors(value);
  if (errors.length > 0) {
    throw new GraphValidationError(errors.map((error) => label + ": " + error));
  }
}

function requiredOwnDataFields(
  value: unknown,
  fields: readonly string[],
  path: string,
): string[] {
  return fields
    .filter((field) => !hasOwnEnumerableDataProperty(value, field))
    .map((field) => path + "." + field + " must be an own enumerable data property");
}

function metadataRevisionProvenanceErrors(
  value: Partial<GraphRecordMetadata>,
  path: string,
): string[] {
  if (!isSafeNonNegativeInteger(value.revision) ||
    !value.provenance ||
    !isRecord(value.provenance)) {
    return [];
  }
  const provenanceRevision = value.provenance.revision;
  if (provenanceRevision !== undefined && provenanceRevision !== value.revision) {
    return [path + ".provenance.revision must match " + path + ".revision when present"];
  }
  return [];
}

function requireNonEmptyString(value: unknown, path: string): string[] {
  return typeof value === "string" && value.length > 0
    ? []
    : [path + " must be a non-empty string"];
}

function validateNonNegativeFinite(value: unknown, path: string): string[] {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? []
    : [path + " must be a finite non-negative number"];
}

function recordIds(records: readonly unknown[], path: string): { ids: Set<string>; errors: string[] } {
  const ids = new Set<string>();
  const errors: string[] = [];
  for (let index = 0; index < records.length; index += 1) {
    if (!hasOwnEnumerableDataProperty(records, index)) {
      errors.push(path + "[" + index + "] must be an own enumerable data property");
      continue;
    }
    const record = records[index];
    if (!isRecord(record)) {
      errors.push(path + "[" + index + "] must be an object");
      continue;
    }
    const id = record.id;
    if (typeof id !== "string" || id.length === 0) {
      errors.push(path + "[" + index + "].id must be a non-empty string");
      continue;
    }
    if (ids.has(id)) errors.push(path + "[" + index + "].id duplicates " + id);
    ids.add(id);
  }
  return { ids, errors };
}

function addCrossDomainIds(
  ids: Map<string, string>,
  records: readonly unknown[],
  path: string,
  errors: string[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!isRecord(record) || typeof record.id !== "string" || record.id.length === 0) continue;
    const prior = ids.get(record.id);
    if (prior) errors.push(path + "[" + index + "].id collides with " + prior);
    else ids.set(record.id, path + "[" + index + "]");
  }
}

function undirectedFactKey(from: string, to: string, radius: number): string {
  const endpoints = from < to ? [from, to] : [to, from];
  return canonicalStringify({ from: endpoints[0], to: endpoints[1], radius });
}

function validatePosition(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return [path + " must be an object"];
  }
  for (const axis of ["x", "y", "z"] as const) {
    if (!hasOwnEnumerableDataProperty(value, axis)) {
      errors.push(path + "." + axis + " must be an own enumerable data property");
      continue;
    }
    const coordinate = value[axis];
    if (typeof coordinate !== "number" || !Number.isFinite(coordinate)) {
      errors.push(path + "." + axis + " must be finite");
    }
  }
  return errors;
}

function validateInteriorGraph(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return [path + " must be an object"];
  }
  const graph = value as Partial<InteriorGraph>;
  errors.push(...requiredOwnDataFields(value, ["kind", "nodes", "edges"], path));
  if (graph.kind !== "interior-graph") errors.push(path + ".kind is invalid");
  if (!Array.isArray(graph.nodes)) errors.push(path + ".nodes must be an array");
  if (!Array.isArray(graph.edges)) errors.push(path + ".edges must be an array");
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return errors;

  const nodeRecords = recordIds(graph.nodes, path + ".nodes");
  const edgeRecords = recordIds(graph.edges, path + ".edges");
  errors.push(...nodeRecords.errors, ...edgeRecords.errors);
  const allIds = new Map<string, string>();
  addCrossDomainIds(allIds, graph.nodes, path + ".nodes", errors);
  addCrossDomainIds(allIds, graph.edges, path + ".edges", errors);

  for (let index = 0; index < graph.nodes.length; index += 1) {
    const node = graph.nodes[index];
    const nodePath = path + ".nodes[" + index + "]";
    if (!isRecord(node)) continue;
    errors.push(...requiredOwnDataFields(
      node,
      ["id", "nodeType", "parentRevision", "position", "radius", "revision", "lifecycle", "provenance"],
      nodePath,
    ));
    errors.push(...validateGraphMetadata(node, nodePath, { requireParentRevision: true }));
    errors.push(...metadataRevisionProvenanceErrors(node, nodePath));
    if (node.nodeType !== "interior-strut-node") {
      errors.push(nodePath + ".nodeType is invalid");
    }
    errors.push(...validatePosition(node.position, nodePath + ".position"));
    errors.push(...validateNonNegativeFinite(node.radius, nodePath + ".radius"));
  }

  const factKeys = new Set<string>();
  for (let index = 0; index < graph.edges.length; index += 1) {
    const edge = graph.edges[index];
    const edgePath = path + ".edges[" + index + "]";
    if (!isRecord(edge)) continue;
    errors.push(...requiredOwnDataFields(
      edge,
      ["id", "edgeType", "parentRevision", "from", "to", "radius", "revision", "lifecycle", "provenance"],
      edgePath,
    ));
    errors.push(...validateGraphEndpointRecord(edge, edgePath));
    errors.push(...validateGraphMetadata(edge, edgePath, { requireParentRevision: true }));
    errors.push(...metadataRevisionProvenanceErrors(edge, edgePath));
    if (edge.edgeType !== "interior-strut") errors.push(edgePath + ".edgeType is invalid");
    if (typeof edge.from !== "string" || !nodeRecords.ids.has(edge.from)) {
      errors.push(edgePath + ".from is a dangling interior endpoint");
    }
    if (typeof edge.to !== "string" || !nodeRecords.ids.has(edge.to)) {
      errors.push(edgePath + ".to is a dangling interior endpoint");
    }
    if (edge.from === edge.to) errors.push(edgePath + " must not be a self-loop");
    errors.push(...validateNonNegativeFinite(edge.radius, edgePath + ".radius"));
    if (typeof edge.from === "string" && typeof edge.to === "string" &&
      typeof edge.radius === "number" && Number.isFinite(edge.radius)) {
      const fact = undirectedFactKey(edge.from, edge.to, edge.radius);
      if (factKeys.has(fact)) errors.push(edgePath + " duplicates an interior strut fact");
      factKeys.add(fact);
    }
  }
  return errors;
}

function validateArtworkConnections(
  value: unknown,
  path: string,
  surfaceNodeIds: ReadonlySet<string>,
  interiorNodeIds: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  if (!Array.isArray(value)) return [path + " must be an array"];
  const records = recordIds(value, path);
  errors.push(...records.errors);
  const factKeys = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const connection = value[index];
    const connectionPath = path + "[" + index + "]";
    if (!isRecord(connection)) continue;
    errors.push(...requiredOwnDataFields(
      connection,
      [
        "id", "edgeType", "parentRevision", "connectionKind", "surfaceNodeId", "interiorNodeId",
        "from", "to", "radius", "revision", "lifecycle", "provenance",
      ],
      connectionPath,
    ));
    errors.push(...validateGraphEndpointRecord(connection, connectionPath));
    errors.push(...validateGraphMetadata(connection, connectionPath, { requireParentRevision: true }));
    errors.push(...metadataRevisionProvenanceErrors(connection, connectionPath));
    if (connection.edgeType !== "artwork-connection") {
      errors.push(connectionPath + ".edgeType is invalid");
    }
    if (connection.connectionKind !== "surface-to-interior") {
      errors.push(connectionPath + ".connectionKind is invalid");
    }
    if (typeof connection.surfaceNodeId !== "string" ||
      !surfaceNodeIds.has(connection.surfaceNodeId)) {
      errors.push(connectionPath + ".surfaceNodeId is a dangling surface endpoint");
    }
    if (typeof connection.interiorNodeId !== "string" ||
      !interiorNodeIds.has(connection.interiorNodeId)) {
      errors.push(connectionPath + ".interiorNodeId is a dangling interior endpoint");
    }
    if (connection.from !== connection.surfaceNodeId ||
      connection.to !== connection.interiorNodeId) {
      errors.push(connectionPath + ".from/to must match surfaceNodeId/interiorNodeId");
    }
    if (connection.surfaceNodeId === connection.interiorNodeId) {
      errors.push(connectionPath + " must connect distinct domains");
    }
    errors.push(...validateNonNegativeFinite(connection.radius, connectionPath + ".radius"));
    if (typeof connection.surfaceNodeId === "string" &&
      typeof connection.interiorNodeId === "string" &&
      typeof connection.radius === "number" &&
      Number.isFinite(connection.radius)) {
      const fact = canonicalStringify({
        surfaceNodeId: connection.surfaceNodeId,
        interiorNodeId: connection.interiorNodeId,
        radius: connection.radius,
      });
      if (factKeys.has(fact)) errors.push(connectionPath + " duplicates an artwork connection fact");
      factKeys.add(fact);
    }
  }
  return errors;
}

function validateArtworkSnapshot(
  value: unknown,
  path: string,
): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [path + " must be an object"];
  errors.push(...requiredOwnDataFields(value, ["surface", "interior", "connections"], path));

  const surfaceResult = validateSurfaceGraph(value.surface);
  if (!surfaceResult.ok) {
    errors.push(...surfaceResult.errors.map((error) => path + ".surface: " + error));
  }
  errors.push(...validateInteriorGraph(value.interior, path + ".interior"));
  const surfaceNodeIds = surfaceResult.ok
    ? new Set(surfaceResult.value.nodes.map((node) => node.id))
    : new Set<string>();
  const interiorNodeIds = isRecord(value.interior) && Array.isArray(value.interior.nodes)
    ? new Set(value.interior.nodes.map((node) => isRecord(node) ? node.id : undefined).filter(
      (id): id is string => typeof id === "string",
    ))
    : new Set<string>();
  errors.push(...validateArtworkConnections(
    value.connections,
    path + ".connections",
    surfaceNodeIds,
    interiorNodeIds,
  ));

  if (surfaceResult.ok && isRecord(value.interior) &&
    Array.isArray(value.interior.nodes) && Array.isArray(value.interior.edges) &&
    Array.isArray(value.connections)) {
    const ids = new Map<string, string>();
    addCrossDomainIds(ids, surfaceResult.value.nodes, path + ".surface.nodes", errors);
    addCrossDomainIds(ids, surfaceResult.value.edges, path + ".surface.edges", errors);
    addCrossDomainIds(ids, value.interior.nodes, path + ".interior.nodes", errors);
    addCrossDomainIds(ids, value.interior.edges, path + ".interior.edges", errors);
    addCrossDomainIds(ids, value.connections, path + ".connections", errors);
  }
  return errors;
}

function validateSnapshotRecordRevisions(
  value: unknown,
  limit: number,
  path: string,
): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return errors;
  const collections: [readonly unknown[], string][] = [];
  if (isRecord(value.interior) && Array.isArray(value.interior.nodes)) {
    collections.push([value.interior.nodes, path + ".interior.nodes"]);
  }
  if (isRecord(value.interior) && Array.isArray(value.interior.edges)) {
    collections.push([value.interior.edges, path + ".interior.edges"]);
  }
  if (Array.isArray(value.connections)) {
    collections.push([value.connections, path + ".connections"]);
  }
  for (const [records, recordsPath] of collections) {
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (!isRecord(record) || !isSafeNonNegativeInteger(record.revision)) continue;
      if (record.revision > limit) {
        errors.push(recordsPath + "[" + index + "].revision must not exceed " + path + " revision");
      }
    }
  }
  return errors;
}

function hasGeneratedPredecessor(provenance: GraphProvenance): boolean {
  try {
    return graphProvenanceFacts(provenance).some((fact) =>
      fact.source === "generated" && fact.intent === "generated",
    );
  } catch {
    return false;
  }
}

function validateCandidateLifecycle(
  candidate: Partial<ArtworkIntegrationCandidate>,
  path: string,
): string[] {
  const errors: string[] = [];
  const provenance = candidate.provenance;
  if (!provenance || !isRecord(provenance)) return errors;
  if (candidate.lifecycle === "candidate") {
    if (provenance.source !== "generated" || provenance.intent !== "generated") {
      errors.push(path + ".candidate lifecycle requires generated provenance");
    }
  } else if (candidate.lifecycle === "confirmed") {
    if (provenance.source !== "author" || provenance.intent !== "pinned") {
      errors.push(path + ".confirmed candidate requires author pinned provenance");
    }
    if (!hasGeneratedPredecessor(provenance)) {
      errors.push(path + ".confirmed candidate requires a generated provenance predecessor");
    }
  } else if (candidate.lifecycle === "rejected") {
    if (provenance.source !== "author" || provenance.intent !== "manuallyDeleted") {
      errors.push(path + ".rejected candidate requires author manuallyDeleted provenance");
    }
    if (!hasGeneratedPredecessor(provenance)) {
      errors.push(path + ".rejected candidate requires a generated provenance predecessor");
    }
  } else if (candidate.lifecycle === "stale") {
    if (provenance.source !== "author" || provenance.intent !== "pinned") {
      errors.push(path + ".stale candidate requires author pinned provenance");
    }
    if (!hasGeneratedPredecessor(provenance)) {
      errors.push(path + ".stale candidate requires a generated provenance predecessor");
    }
  }
  return errors;
}

function validateCandidate(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [path + " must be an object"];
  const candidate = value as Partial<ArtworkIntegrationCandidate>;
  errors.push(...requiredOwnDataFields(
    value,
    [
      "id", "kind", "schemaVersion", "parentRevision", "lineage", "lifecycle", "provenance",
      "surface", "interior", "connections", "candidateId", "candidateRevision", "baseRevision",
      "baseFingerprint", "inputFingerprint", "generator", "algorithmVersion", "unresolvedFacts", "revision",
    ],
    path,
  ));
  errors.push(...validateGraphMetadata(value, path, { requireParentRevision: true }));
  errors.push(...metadataRevisionProvenanceErrors(candidate, path));
  errors.push(...validateRevisionLineage(value, path));
  if (candidate.kind !== "artwork-integration-candidate") {
    errors.push(path + ".kind is invalid");
  }
  if (candidate.schemaVersion !== 1) errors.push(path + ".schemaVersion is invalid");
  errors.push(...requireNonEmptyString(candidate.candidateId, path + ".candidateId"));
  if (candidate.id !== candidate.candidateId) errors.push(path + ".id must equal candidateId");
  if (!isSafeNonNegativeInteger(candidate.candidateRevision)) {
    errors.push(path + ".candidateRevision is invalid");
  }
  if (!isSafeNonNegativeInteger(candidate.baseRevision)) {
    errors.push(path + ".baseRevision is invalid");
  }
  if (isSafeNonNegativeInteger(candidate.baseRevision) &&
    isSafeNonNegativeInteger(candidate.candidateRevision) &&
    candidate.baseRevision >= candidate.candidateRevision) {
    errors.push(path + ".baseRevision must be less than candidateRevision");
  }
  if (isSafeNonNegativeInteger(candidate.candidateRevision) &&
    isSafeNonNegativeInteger(candidate.revision) &&
    candidate.candidateRevision > candidate.revision) {
    errors.push(path + ".candidateRevision must not exceed current candidate revision");
  }
  for (const field of ["baseFingerprint", "inputFingerprint", "generator", "algorithmVersion"] as const) {
    errors.push(...requireNonEmptyString(candidate[field], path + "." + field));
  }
  if (candidate.provenance && isRecord(candidate.provenance)) {
    // The current fact becomes author-owned after accept/reject/stale. The
    // immutable generator fields remain on the candidate record and in its
    // provenance history, but an author fact need not repeat them.
    if (candidate.provenance.source === "generated") {
      if (candidate.provenance.generator !== candidate.generator) {
        errors.push(path + ".provenance.generator must match generator");
      }
      if (candidate.provenance.algorithmVersion !== candidate.algorithmVersion) {
        errors.push(path + ".provenance.algorithmVersion must match algorithmVersion");
      }
      if (candidate.provenance.inputFingerprint !== candidate.inputFingerprint) {
        errors.push(path + ".provenance.inputFingerprint must match inputFingerprint");
      }
    }
  }
  if (!Array.isArray(candidate.unresolvedFacts)) {
    errors.push(path + ".unresolvedFacts must be an array");
  } else {
    for (let index = 0; index < candidate.unresolvedFacts.length; index += 1) {
      if (!hasOwnEnumerableDataProperty(candidate.unresolvedFacts, index)) {
        errors.push(path + ".unresolvedFacts[" + index + "] must be an own enumerable data property");
      } else if (typeof candidate.unresolvedFacts[index] !== "string" ||
        candidate.unresolvedFacts[index].length === 0) {
        errors.push(path + ".unresolvedFacts[" + index + "] must be a non-empty string");
      }
    }
  }
  errors.push(...validateArtworkSnapshot(candidate, path));
  if (isSafeNonNegativeInteger(candidate.candidateRevision)) {
    errors.push(...validateSnapshotRecordRevisions(
      candidate,
      candidate.revision ?? candidate.candidateRevision,
      path,
    ));
  }
  if (isRecord(candidate.surface) &&
    isSafeNonNegativeInteger(candidate.surface.revision) &&
    isSafeNonNegativeInteger(candidate.candidateRevision) &&
    candidate.surface.revision > candidate.candidateRevision) {
    errors.push(path + ".surface.revision must not exceed candidateRevision");
  }
  errors.push(...validateCandidateLifecycle(candidate, path));
  errors.push(...candidateGeneratedEvidence(candidate, path).errors);
  return errors;
}

function isLineageSubsequence(
  childLineage: readonly number[],
  containerLineage: readonly number[],
): boolean {
  let containerIndex = 0;
  for (const revision of childLineage) {
    while (containerIndex < containerLineage.length && containerLineage[containerIndex] !== revision) {
      containerIndex += 1;
    }
    if (containerIndex >= containerLineage.length) return false;
    containerIndex += 1;
  }
  return true;
}

function validateCandidateContainerLineage(
  candidate: Partial<ArtworkIntegrationCandidate>,
  graph: Partial<ArtworkGraph>,
  path: string,
): string[] {
  const errors: string[] = [];
  if (!Array.isArray(candidate.lineage) || !Array.isArray(graph.lineage)) return errors;
  if (isSafeNonNegativeInteger(candidate.revision) &&
    isSafeNonNegativeInteger(graph.revision) &&
    candidate.revision > graph.revision) {
    errors.push(path + ".revision must not exceed containing artwork graph revision");
  }
  if (isSafeNonNegativeInteger(candidate.candidateRevision) &&
    isSafeNonNegativeInteger(graph.revision) &&
    candidate.candidateRevision > graph.revision) {
    errors.push(path + ".candidateRevision must not be a future revision outside the containing artwork graph");
  }
  if (candidate.parentRevision !== null && candidate.parentRevision !== undefined &&
    isSafeNonNegativeInteger(candidate.parentRevision) &&
    !graph.lineage.includes(candidate.parentRevision)) {
    errors.push(path + ".parentRevision must be embedded in containing artwork graph lineage");
  }
  if (!isLineageSubsequence(candidate.lineage, graph.lineage)) {
    errors.push(path + ".lineage must be embedded in containing artwork graph lineage");
  }
  if (isSafeNonNegativeInteger(candidate.candidateRevision) &&
    !candidate.lineage.includes(candidate.candidateRevision)) {
    errors.push(path + ".candidateRevision must be embedded in candidate lineage");
  }
  if (isSafeNonNegativeInteger(candidate.revision) &&
    !candidate.lineage.includes(candidate.revision)) {
    errors.push(path + ".revision must be embedded in candidate lineage");
  }
  if (isSafeNonNegativeInteger(candidate.baseRevision) &&
    isSafeNonNegativeInteger(graph.revision) &&
    candidate.baseRevision > graph.revision) {
    errors.push(path + ".baseRevision must not be a future revision outside the containing artwork graph");
  }
  return errors;
}

function validateConfirmedSnapshot(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [path + " must be an object"];
  const confirmed = value as Partial<IntegratedConfirmedArtwork>;
  errors.push(...requiredOwnDataFields(
    value,
    [
      "id", "kind", "schemaVersion", "parentRevision", "lineage", "lifecycle", "provenance",
      "surface", "interior", "connections", "sourceCandidateId", "revision",
    ],
    path,
  ));
  errors.push(...validateGraphMetadata(value, path, { requireParentRevision: true }));
  errors.push(...metadataRevisionProvenanceErrors(confirmed, path));
  errors.push(...validateRevisionLineage(value, path));
  if (confirmed.kind !== "artwork-confirmed-snapshot") {
    errors.push(path + ".kind is invalid");
  }
  if (confirmed.schemaVersion !== 1) errors.push(path + ".schemaVersion is invalid");
  errors.push(...requireNonEmptyString(confirmed.sourceCandidateId, path + ".sourceCandidateId"));
  if (confirmed.lifecycle !== "confirmed") errors.push(path + ".lifecycle must be confirmed");
  if (confirmed.provenance && isRecord(confirmed.provenance)) {
    if (confirmed.provenance.source !== "author" ||
      confirmed.provenance.intent !== "pinned") {
      errors.push(path + ".provenance must be author pinned");
    }
    if (!hasGeneratedPredecessor(confirmed.provenance)) {
      errors.push(path + ".provenance requires a generated predecessor");
    }
  }
  errors.push(...validateArtworkSnapshot(confirmed, path));
  if (isSafeNonNegativeInteger(confirmed.revision)) {
    errors.push(...validateSnapshotRecordRevisions(
      confirmed,
      confirmed.revision,
      path,
    ));
  }
  if (isRecord(confirmed.surface) &&
    isSafeNonNegativeInteger(confirmed.surface.revision) &&
    isSafeNonNegativeInteger(confirmed.revision) &&
    confirmed.surface.revision > confirmed.revision) {
    errors.push(path + ".surface.revision must not exceed confirmed revision");
  }
  return errors;
}

function expectedState(
  candidates: readonly unknown[],
  integratedConfirmed: IntegratedConfirmedArtwork | null,
): ArtworkGraphState {
  if (candidates.some((candidate) => isRecord(candidate) && candidate.lifecycle === "candidate")) {
    return "integrationCandidate";
  }
  return integratedConfirmed ? "integratedConfirmed" : "surfaceDraft";
}

/** Validate the complete Artwork Graph container and every typed slot. */
export function validateArtworkGraph(value: unknown): GraphValidationResult<ArtworkGraph> {
  // This is intentionally the first boundary operation.  The semantic
  // validators below read typed fields, and must never be allowed to observe a
  // lossy clone of an object that still has inherited/accessor/symbol facts.
  const strictErrors = strictJsonBoundaryErrors(value);
  if (strictErrors.length > 0) {
    return { ok: false, errors: [...new Set(strictErrors)] };
  }

  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["artwork graph must be an object"] };
  const graph = value as Partial<ArtworkGraph>;
  errors.push(...requiredOwnDataFields(
    value,
    [
      "id", "kind", "schemaVersion", "revision", "parentRevision", "lineage", "lifecycle", "provenance",
      "state", "surfaceDraft", "integrationCandidates", "integratedConfirmed",
    ],
    "artwork graph",
  ));
  errors.push(...validateGraphMetadata(value, "artwork graph", { requireParentRevision: true }));
  errors.push(...metadataRevisionProvenanceErrors(graph, "artwork graph"));
  errors.push(...validateRevisionLineage(value, "artwork graph"));
  if (graph.kind !== "artwork-graph") errors.push("artwork graph kind is invalid");
  if (graph.schemaVersion !== 1) errors.push("artwork graph schemaVersion is invalid");
  if (graph.state !== "surfaceDraft" &&
    graph.state !== "integrationCandidate" &&
    graph.state !== "integratedConfirmed") {
    errors.push("artwork graph state is invalid");
  }
  if (!hasOwnEnumerableDataProperty(value, "surfaceDraft")) {
    errors.push("artwork graph surfaceDraft is required");
  }
  if (!hasOwnEnumerableDataProperty(value, "integratedConfirmed")) {
    errors.push("artwork graph integratedConfirmed is required");
  }
  if (!Array.isArray(graph.integrationCandidates)) {
    errors.push("artwork graph integrationCandidates must be an array");
  }
  if (graph.integratedConfirmed === undefined) {
    errors.push("artwork graph integratedConfirmed must be null or a confirmed snapshot");
  }

  const surfaceResult = validateSurfaceGraph(graph.surfaceDraft);
  if (!surfaceResult.ok) {
    errors.push(...surfaceResult.errors.map((error) =>
      "artwork graph surfaceDraft: " + error,
    ));
  }
  if (surfaceResult.ok &&
    isSafeNonNegativeInteger(surfaceResult.value.revision) &&
    isSafeNonNegativeInteger(graph.revision) &&
    surfaceResult.value.revision > graph.revision) {
    errors.push("artwork graph surfaceDraft.revision must not exceed artwork graph revision");
  }

  const candidateIds = new Set<string>();
  let confirmedCandidateCount = 0;
  let pendingCandidateCount = 0;
  if (Array.isArray(graph.integrationCandidates)) {
    for (let index = 0; index < graph.integrationCandidates.length; index += 1) {
      const candidate = graph.integrationCandidates[index];
      const candidatePath = "artwork graph integrationCandidates[" + index + "]";
      errors.push(...validateCandidate(candidate, candidatePath));
      if (isRecord(candidate)) {
        errors.push(...validateCandidateContainerLineage(
          candidate as Partial<ArtworkIntegrationCandidate>,
          graph,
          candidatePath,
        ));
        const generatedEvidence = candidateGeneratedEvidence(
          candidate as Partial<ArtworkIntegrationCandidate>,
          candidatePath,
        );
        if (generatedEvidence.evidence) {
          errors.push(...candidateBaseRevisionErrors(
            candidate as Partial<ArtworkIntegrationCandidate>,
            graph,
            generatedEvidence.evidence.payload,
            candidatePath,
          ));
        }
        if (candidate.lifecycle === "candidate" &&
          typeof candidate.baseFingerprint === "string" &&
          isSafeNonNegativeInteger(graph.revision)) {
          try {
            if (candidate.baseFingerprint !== activeSnapshotFingerprint(graph as ArtworkGraph)) {
              errors.push(candidatePath + ".baseFingerprint must match the current active snapshot while pending");
            }
          } catch (error) {
            errors.push(error instanceof Error ? error.message : candidatePath + ".baseFingerprint is not comparable");
          }
        }
      }
      if (isRecord(candidate) && typeof candidate.candidateId === "string") {
        if (candidateIds.has(candidate.candidateId)) {
          errors.push(candidatePath + ".candidateId duplicates " + candidate.candidateId);
        }
        candidateIds.add(candidate.candidateId);
        if (candidate.candidateId === graph.id) {
          errors.push(candidatePath + ".candidateId collides with artwork graph id");
        }
      }
      if (isRecord(candidate) && candidate.lifecycle === "confirmed") confirmedCandidateCount += 1;
      if (isRecord(candidate) && candidate.lifecycle === "candidate") pendingCandidateCount += 1;
    }
  }

  if (graph.integratedConfirmed !== null && graph.integratedConfirmed !== undefined) {
    errors.push(...validateConfirmedSnapshot(
      graph.integratedConfirmed,
      "artwork graph integratedConfirmed",
    ));
    if (isRecord(graph.integratedConfirmed) &&
      isSafeNonNegativeInteger(graph.revision) &&
      isSafeNonNegativeInteger(graph.integratedConfirmed.revision) &&
      graph.integratedConfirmed.revision > graph.revision) {
      errors.push("artwork graph integratedConfirmed.revision must not exceed artwork graph revision");
    }
    if (isRecord(graph.integratedConfirmed) &&
      Array.isArray(graph.lineage) && Array.isArray(graph.integratedConfirmed.lineage)) {
      const confirmedLineage = graph.integratedConfirmed.lineage;
      const lineagePrefix = graph.lineage.slice(0, confirmedLineage.length);
      if (JSON.stringify(lineagePrefix) !== JSON.stringify(confirmedLineage)) {
        errors.push("artwork graph integratedConfirmed.lineage must be a graph-lineage prefix");
      }
    }
  }

  if (graph.integratedConfirmed === null && confirmedCandidateCount > 0) {
    errors.push("confirmed integration candidate requires integratedConfirmed");
  }
  if (graph.integratedConfirmed !== null && graph.integratedConfirmed !== undefined &&
    confirmedCandidateCount === 0) {
    errors.push("integratedConfirmed requires a confirmed integration candidate");
  }
  if (graph.integratedConfirmed !== null && graph.integratedConfirmed !== undefined &&
    isRecord(graph.integratedConfirmed)) {
    const sourceCandidateId = graph.integratedConfirmed.sourceCandidateId;
    const matching = Array.isArray(graph.integrationCandidates)
      ? graph.integrationCandidates.find((candidate) =>
        isRecord(candidate) && candidate.candidateId === sourceCandidateId,
      )
      : undefined;
    if (!matching || matching.lifecycle !== "confirmed") {
      errors.push("integratedConfirmed.sourceCandidateId must name the confirmed candidate");
    } else if (isRecord(matching)) {
      const confirmed = graph.integratedConfirmed as IntegratedConfirmedArtwork;
      const candidate = matching as ArtworkIntegrationCandidate;
      try {
        if (snapshotFingerprint(confirmed) !== snapshotFingerprint(candidate)) {
          errors.push("integratedConfirmed content must canonical-equal its confirmed source candidate");
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "integratedConfirmed content is not fingerprintable");
      }
      try {
        if (canonicalStringify(confirmed.provenance) !== canonicalStringify(candidate.provenance)) {
          errors.push("integratedConfirmed provenance must canonical-equal its confirmed source candidate");
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "integratedConfirmed provenance is not canonical");
      }
      const candidateEvidence = candidateGeneratedEvidence(candidate, "artwork graph source candidate");
      if (candidateEvidence.evidence) {
        try {
          const confirmedFacts = graphProvenanceFacts(confirmed.provenance)
            .filter((fact) => fact.source === "generated" && fact.intent === "generated");
          if (confirmedFacts.length !== 1 ||
            canonicalStringify(confirmedFacts[0]) !== canonicalStringify(candidateEvidence.evidence.fact)) {
            errors.push("integratedConfirmed provenance must retain the source candidate generated fingerprints");
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "integratedConfirmed generated provenance is not canonical");
        }
      }
    }
  }

  const derivedState = Array.isArray(graph.integrationCandidates)
    ? expectedState(
      graph.integrationCandidates,
      graph.integratedConfirmed === null || graph.integratedConfirmed === undefined
        ? null
        : graph.integratedConfirmed,
    )
    : undefined;
  if (derivedState !== undefined && graph.state !== derivedState) {
    errors.push("artwork graph state does not match explicit slots");
  }
  const derivedLifecycle: GraphLifecycle =
    graph.state === "integratedConfirmed" ? "confirmed" : "candidate";
  if (graph.lifecycle !== derivedLifecycle) {
    errors.push("artwork graph lifecycle does not match explicit slots");
  }
  if (graph.lifecycle === "confirmed" && graph.provenance && isRecord(graph.provenance)) {
    if (graph.provenance.source !== "author" || graph.provenance.intent === "generated") {
      errors.push("confirmed artwork graph requires a non-generated author provenance fact");
    }
    if (!hasGeneratedPredecessor(graph.provenance)) {
      errors.push("confirmed artwork graph requires a generated provenance predecessor");
    }
  }
  if (graph.state === "integratedConfirmed" &&
    graph.integratedConfirmed !== null) {
    // The snapshot validator above supplies the detailed errors.
  } else if (graph.state === "integratedConfirmed") {
    errors.push("integratedConfirmed state requires an integratedConfirmed snapshot");
  }
  if (graph.state === "surfaceDraft" && pendingCandidateCount !== 0) {
    errors.push("surfaceDraft state cannot contain pending integration candidates");
  }

  errors.push(...validateFiniteNumbers(value, "artwork graph"));
  try {
    canonicalStringify(canonicalArtworkValue(value as unknown as ArtworkGraph), ARTWORK_CANONICAL_OPTIONS);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "artwork graph is not persistable JSON");
  }
  const uniqueErrors = [...new Set(errors)];
  return uniqueErrors.length > 0
    ? { ok: false, errors: uniqueErrors }
    : { ok: true, value: value as unknown as ArtworkGraph, errors: [] };
}

export function assertValidArtworkGraph(graph: ArtworkGraph): ArtworkGraph {
  const result = validateArtworkGraph(graph);
  return assertGraphValid(graph, result.ok ? [] : result.errors);
}

export function isArtworkGraph(value: unknown): value is ArtworkGraph {
  return validateArtworkGraph(value).ok;
}

export function createInteriorStrutNode(
  id: string,
  position: { x: number; y: number; z: number },
  radius: number,
  options: {
    revision?: number;
    parentRevision?: number | null;
    lifecycle?: GraphLifecycle;
    provenance?: GraphProvenance;
  } = {},
): InteriorStrutNode {
  assertStrictJsonBoundary({ id, position, radius, options }, "interior node input");
  const revision = assertRevision(options.revision ?? 0, "interior node revision");
  const node: InteriorStrutNode = {
    id,
    nodeType: "interior-strut-node",
    parentRevision: options.parentRevision ?? null,
    position: { x: position.x, y: position.y, z: position.z },
    radius,
    revision,
    lifecycle: options.lifecycle ?? "candidate",
    provenance: cloneGraphValue(options.provenance ?? generatedProvenance(
      canonicalStringify({ id, position, radius }),
      "interior-node",
      revision,
    )),
  };
  const errors = validateInteriorGraph({
    kind: "interior-graph",
    nodes: [node],
    edges: [],
  }, "interior graph");
  if (errors.length > 0) throw new GraphValidationError(errors);
  return node;
}

export function createInteriorStrutEdge(
  id: string,
  from: string,
  to: string,
  radius: number,
  options: {
    revision?: number;
    parentRevision?: number | null;
    lifecycle?: GraphLifecycle;
    provenance?: GraphProvenance;
  } = {},
): InteriorStrutEdge {
  assertStrictJsonBoundary({ id, from, to, radius, options }, "interior edge input");
  const revision = assertRevision(options.revision ?? 0, "interior edge revision");
  const edge: InteriorStrutEdge = {
    id,
    edgeType: "interior-strut",
    from,
    to,
    radius,
    revision,
    parentRevision: options.parentRevision ?? null,
    lifecycle: options.lifecycle ?? "candidate",
    provenance: cloneGraphValue(options.provenance ?? generatedProvenance(
      canonicalStringify({ id, from, to, radius }),
      "interior-strut",
      revision,
    )),
  };
  const errors = [
    ...validateGraphEndpointRecord(edge, "interior strut"),
    ...validateGraphMetadata(edge, "interior strut", { requireParentRevision: true }),
    ...metadataRevisionProvenanceErrors(edge, "interior strut"),
    ...validateNonNegativeFinite(radius, "interior strut.radius"),
  ];
  if (errors.length > 0) throw new GraphValidationError(errors);
  return edge;
}

export function createArtworkConnection(
  id: string,
  surfaceNodeId: string,
  interiorNodeId: string,
  radius: number,
  options: {
    revision?: number;
    parentRevision?: number | null;
    lifecycle?: GraphLifecycle;
    provenance?: GraphProvenance;
  } = {},
): ArtworkConnection {
  assertStrictJsonBoundary({ id, surfaceNodeId, interiorNodeId, radius, options }, "artwork connection input");
  const revision = assertRevision(options.revision ?? 0, "artwork connection revision");
  const connection: ArtworkConnection = {
    id,
    edgeType: "artwork-connection",
    connectionKind: "surface-to-interior",
    surfaceNodeId,
    interiorNodeId,
    from: surfaceNodeId,
    to: interiorNodeId,
    radius,
    revision,
    parentRevision: options.parentRevision ?? null,
    lifecycle: options.lifecycle ?? "candidate",
    provenance: cloneGraphValue(options.provenance ?? generatedProvenance(
      canonicalStringify({ id, surfaceNodeId, interiorNodeId, radius }),
      "artwork-connection",
      revision,
    )),
  };
  const errors = [
    ...validateGraphEndpointRecord(connection, "artwork connection"),
    ...validateGraphMetadata(connection, "artwork connection", { requireParentRevision: true }),
    ...metadataRevisionProvenanceErrors(connection, "artwork connection"),
    ...requireNonEmptyString(surfaceNodeId, "artwork connection.surfaceNodeId"),
    ...requireNonEmptyString(interiorNodeId, "artwork connection.interiorNodeId"),
    ...validateNonNegativeFinite(radius, "artwork connection.radius"),
  ];
  if (errors.length > 0) throw new GraphValidationError(errors);
  return connection;
}

export function createInteriorGraph(
  nodes: readonly InteriorStrutNode[] = [],
  edges: readonly InteriorStrutEdge[] = [],
): InteriorGraph {
  assertStrictJsonBoundary({ nodes, edges }, "interior graph input");
  const graph: InteriorGraph = {
    kind: "interior-graph",
    nodes: nodes.map((node) => cloneGraphValue(node)),
    edges: edges.map((edge) => cloneGraphValue(edge)),
  };
  const errors = validateInteriorGraph(graph, "interior graph");
  if (errors.length > 0) throw new GraphValidationError(errors);
  return graph;
}

function snapshotValue(
  surface: SurfaceGraph,
  interior: InteriorGraph,
  connections: readonly ArtworkConnection[],
): ArtworkSnapshot {
  return {
    surface: cloneGraphValue(surface),
    interior: {
      kind: "interior-graph",
      nodes: interior.nodes.map((node) => cloneGraphValue(node)),
      edges: interior.edges.map((edge) => cloneGraphValue(edge)),
    },
    connections: connections.map((connection) => cloneGraphValue(connection)),
  };
}

function emptySnapshot(surface: SurfaceGraph): ArtworkSnapshot {
  return snapshotValue(surface, { kind: "interior-graph", nodes: [], edges: [] }, []);
}

function canonicalSnapshotValue(snapshot: ArtworkSnapshot): ArtworkSnapshot {
  const result = cloneGraphValue(snapshot);
  result.surface.nodes = asGraphEntityCollection(result.surface.nodes) as unknown as typeof result.surface.nodes;
  result.surface.edges = asGraphEntityCollection(result.surface.edges) as unknown as typeof result.surface.edges;
  result.interior.nodes = asGraphEntityCollection(result.interior.nodes) as unknown as typeof result.interior.nodes;
  result.interior.edges = asGraphEntityCollection(result.interior.edges) as unknown as typeof result.interior.edges;
  result.connections = asGraphEntityCollection(result.connections) as unknown as typeof result.connections;
  return result;
}

/**
 * This is a deterministic semantic-snapshot fingerprint, not a geometry or
 * printability fingerprint.  Container metadata is excluded so a sibling
 * candidate does not make the active snapshot look changed.
 */
function snapshotFingerprint(snapshot: ArtworkSnapshot): string {
  return canonicalStringify(canonicalSnapshotValue({
    surface: snapshot.surface,
    interior: snapshot.interior,
    connections: snapshot.connections,
  }), {
    entityCollectionPaths: [
      "surface.nodes",
      "surface.edges",
      "interior.nodes",
      "interior.edges",
      "connections",
    ],
    sortGraphEntityCollections: true,
  });
}

function activeSnapshot(graph: ArtworkGraph): ArtworkSnapshot {
  if (graph.integratedConfirmed) {
    return snapshotValue(
      graph.integratedConfirmed.surface,
      graph.integratedConfirmed.interior,
      graph.integratedConfirmed.connections,
    );
  }
  return emptySnapshot(graph.surfaceDraft);
}

function activeSnapshotFingerprint(graph: ArtworkGraph): string {
  return snapshotFingerprint(activeSnapshot(graph));
}

/**
 * The revision of the snapshot that is authoritative for new candidates.
 * Container revisions also advance for candidate/rejection bookkeeping, so
 * this deliberately points at the active slot rather than Artwork Graph.revision.
 */
function authoritativeActiveRevision(
  graph: Pick<ArtworkGraph, "integratedConfirmed" | "surfaceDraft">,
): number | undefined {
  if (graph.integratedConfirmed && isSafeNonNegativeInteger(graph.integratedConfirmed.revision)) {
    return graph.integratedConfirmed.revision;
  }
  return isSafeNonNegativeInteger(graph.surfaceDraft?.revision)
    ? graph.surfaceDraft.revision
    : undefined;
}

/**
 * Recover the active revision that existed when a retained candidate was
 * generated.  Pending candidates must match today's active slot directly;
 * retained stale/rejected/confirmed candidates must keep their original base
 * revision even after a later acceptance advances the active slot.  The graph
 * provenance chronology records prior acceptance revisions independently from
 * the candidate payload, while a pre-confirmation candidate is anchored by
 * the Surface revision in its immutable base snapshot.
 */
function candidateGenerationBaseRevision(
  candidate: Partial<ArtworkIntegrationCandidate>,
  graph: Partial<ArtworkGraph>,
  payload: CandidateGeneratedPayload,
): number | undefined {
  if (isRecord(graph.provenance) && isSafeNonNegativeInteger(candidate.candidateRevision)) {
    const candidateRevision = candidate.candidateRevision;
    try {
      const priorAcceptRevisions = graphProvenanceFacts(graph.provenance as GraphProvenance)
        .filter((fact) =>
          fact.source === "author" &&
          fact.intent === "pinned" &&
          fact.operation === "accept-integration-candidate" &&
          isSafeNonNegativeInteger(fact.revision) &&
          fact.revision < candidateRevision,
        )
        .map((fact) => fact.revision as number);
      if (priorAcceptRevisions.length > 0) {
        return Math.max(...priorAcceptRevisions);
      }
    } catch {
      // The normal provenance validator reports malformed history.  Do not
      // manufacture a second anchor from it when that validation has failed.
    }
  }
  return isRecord(payload.baseSnapshot) &&
    isRecord(payload.baseSnapshot.surface) &&
    isSafeNonNegativeInteger(payload.baseSnapshot.surface.revision)
    ? payload.baseSnapshot.surface.revision
    : undefined;
}

function candidateBaseRevisionErrors(
  candidate: Partial<ArtworkIntegrationCandidate>,
  graph: Partial<ArtworkGraph>,
  payload: CandidateGeneratedPayload,
  path: string,
): string[] {
  const errors: string[] = [];
  if (!isSafeNonNegativeInteger(candidate.baseRevision)) return errors;

  const activeRevision = authoritativeActiveRevision({
    integratedConfirmed: graph.integratedConfirmed ?? null,
    surfaceDraft: graph.surfaceDraft as SurfaceGraph,
  });
  if (candidate.lifecycle === "candidate" &&
    activeRevision !== undefined &&
    candidate.baseRevision !== activeRevision) {
    errors.push(path + ".baseRevision must match the authoritative active snapshot revision while pending");
  }

  const generationRevision = candidateGenerationBaseRevision(candidate, graph, payload);
  if (generationRevision !== undefined && candidate.baseRevision !== generationRevision) {
    errors.push(path + ".baseRevision must remain bound to the authoritative active snapshot revision at generation");
  }
  return errors;
}

function canonicalArtworkValue(graph: ArtworkGraph): ArtworkGraph {
  const result = cloneGraphValue(graph);
  result.surfaceDraft.nodes = asGraphEntityCollection(
    result.surfaceDraft.nodes,
  ) as unknown as typeof result.surfaceDraft.nodes;
  result.surfaceDraft.edges = asGraphEntityCollection(
    result.surfaceDraft.edges,
  ) as unknown as typeof result.surfaceDraft.edges;
  result.integrationCandidates = asGraphEntityCollection(
    result.integrationCandidates.map((candidate) => {
      candidate.surface.nodes = asGraphEntityCollection(
        candidate.surface.nodes,
      ) as unknown as typeof candidate.surface.nodes;
      candidate.surface.edges = asGraphEntityCollection(
        candidate.surface.edges,
      ) as unknown as typeof candidate.surface.edges;
      candidate.interior.nodes = asGraphEntityCollection(
        candidate.interior.nodes,
      ) as unknown as typeof candidate.interior.nodes;
      candidate.interior.edges = asGraphEntityCollection(
        candidate.interior.edges,
      ) as unknown as typeof candidate.interior.edges;
      candidate.connections = asGraphEntityCollection(
        candidate.connections,
      ) as unknown as typeof candidate.connections;
      candidate.unresolvedFacts = [...candidate.unresolvedFacts];
      return candidate;
    }),
  ) as unknown as typeof result.integrationCandidates;
  if (result.integratedConfirmed) {
    result.integratedConfirmed.surface.nodes = asGraphEntityCollection(
      result.integratedConfirmed.surface.nodes,
    ) as unknown as typeof result.integratedConfirmed.surface.nodes;
    result.integratedConfirmed.surface.edges = asGraphEntityCollection(
      result.integratedConfirmed.surface.edges,
    ) as unknown as typeof result.integratedConfirmed.surface.edges;
    result.integratedConfirmed.interior.nodes = asGraphEntityCollection(
      result.integratedConfirmed.interior.nodes,
    ) as unknown as typeof result.integratedConfirmed.interior.nodes;
    result.integratedConfirmed.interior.edges = asGraphEntityCollection(
      result.integratedConfirmed.interior.edges,
    ) as unknown as typeof result.integratedConfirmed.interior.edges;
    result.integratedConfirmed.connections = asGraphEntityCollection(
      result.integratedConfirmed.connections,
    ) as unknown as typeof result.integratedConfirmed.connections;
  }
  return result;
}

/** Create Stage 3's strict container with empty Interior/Connections slots. */
export function createArtworkGraph(
  surface: SurfaceGraph,
  options: ArtworkGraphOptions = {},
): ArtworkGraph {
  assertStrictJsonBoundary({ surface, options }, "artwork graph input");
  assertStrictJsonBoundary(options, "artwork graph options");
  const source = assertValidSurfaceGraph(surface);
  if (options.state !== undefined && options.state !== "surfaceDraft") {
    throw new GraphValidationError([
      "a new artwork graph must start in surfaceDraft; accept a candidate explicitly",
    ]);
  }
  const revision = assertRevision(options.revision ?? source.revision, "artwork graph revision");
  if (revision < source.revision) {
    throw new GraphValidationError([
      "artwork graph revision must not precede surfaceDraft revision",
    ]);
  }
  const initialSnapshot = emptySnapshot(source);
  const inputFingerprint = snapshotFingerprint(initialSnapshot);
  const graph: ArtworkGraph = {
    id: options.id ?? "artwork-graph:" + source.patchSetRevision + ":" + source.revision,
    kind: "artwork-graph",
    schemaVersion: 1,
    revision,
    parentRevision: null,
    lineage: [revision],
    lifecycle: "candidate",
    provenance: cloneGraphValue(options.provenance ?? generatedProvenance(
      inputFingerprint,
      "surface-to-artwork-graph",
      revision,
    )),
    state: "surfaceDraft",
    surfaceDraft: cloneGraphValue(source),
    integrationCandidates: [],
    integratedConfirmed: null,
  };
  return assertValidArtworkGraph(graph);
}

export const createStage3ArtworkGraph = createArtworkGraph;
export const createArtworkGraphContainer = createArtworkGraph;

function candidateSnapshotInput(
  base: ArtworkGraph,
  input: IntegrationCandidateInput,
): ArtworkSnapshot {
  assertStrictJsonBoundary(input, "integration candidate input");
  const active = activeSnapshot(base);
  const surface = assertValidSurfaceGraph(input.surface ?? active.surface);
  if (!isRecord(input.interior) ||
    !Array.isArray(input.interior.nodes) ||
    !Array.isArray(input.interior.edges)) {
    throw new GraphValidationError([
      "integration candidate interior must contain nodes and edges arrays",
    ]);
  }
  const interior = createInteriorGraph(input.interior.nodes, input.interior.edges);
  if (input.connections !== undefined && !Array.isArray(input.connections)) {
    throw new GraphValidationError(["integration candidate connections must be an array"]);
  }
  const connections = [...(input.connections ?? [])].map((connection) => cloneGraphValue(connection));
  const snapshot = snapshotValue(surface, interior, connections);
  const errors = validateArtworkSnapshot(snapshot, "integration candidate");
  if (errors.length > 0) throw new GraphValidationError(errors);
  return snapshot;
}

/** Build one immutable generated candidate record from a current container. */
export function makeIntegrationCandidate(
  base: ArtworkGraph,
  input: IntegrationCandidateInput,
  options: IntegrationCandidateOptions = {},
): ArtworkIntegrationCandidate {
  assertStrictJsonBoundary(input, "integration candidate input");
  assertStrictJsonBoundary(options, "integration candidate options");
  const source = assertValidArtworkGraph(base);
  const baseSnapshot = activeSnapshot(source);
  const snapshot = candidateSnapshotInput(source, input);
  const candidateRevision = assertRevision(
    options.revision ?? nextRevision(source),
    "integration candidate revision",
  );
  if (candidateRevision <= source.revision) {
    throw new GraphValidationError(["integration candidate revision must be greater than the base revision"]);
  }
  if (candidateRevision === Number.MAX_SAFE_INTEGER && source.revision >= candidateRevision) {
    throw new GraphValidationError(["integration candidate revision cannot advance beyond safe integer"]);
  }
  const candidateId = options.candidateId ??
    "integration-candidate:" + source.revision + ":" + candidateRevision;
  const generator = options.generator ?? "dry-web-integration";
  const algorithmVersion = options.algorithmVersion ?? "dry-web-integration-v1";
  const unresolvedFacts = [...(options.unresolvedFacts ?? input.unresolvedFacts ?? [])];
  const baseFingerprint = snapshotFingerprint(baseSnapshot);
  const baseRevision = source.integratedConfirmed?.revision ?? source.surfaceDraft.revision;
  const authoritativeRevision = authoritativeActiveRevision(source);
  if (authoritativeRevision === undefined || baseRevision !== authoritativeRevision) {
    throw new GraphValidationError([
      "integration candidate baseRevision must equal the authoritative active snapshot revision",
    ]);
  }
  const inputFingerprint = options.inputFingerprint ?? canonicalStringify({
    baseFingerprint,
    generator,
    algorithmVersion,
    snapshot: canonicalSnapshotValue(snapshot),
    unresolvedFacts,
  });
  errorsForCandidateInputs(candidateId, generator, algorithmVersion, inputFingerprint, unresolvedFacts);
  const candidate: ArtworkIntegrationCandidate = {
    ...snapshot,
    id: candidateId,
    kind: "artwork-integration-candidate",
    schemaVersion: 1,
    parentRevision: source.revision,
    lineage: [...source.lineage, candidateRevision],
    lifecycle: "candidate",
    provenance: generatedProvenance(
      inputFingerprint,
      candidateGeneratedOperation(
        candidateId,
        candidateRevision,
        source.revision,
        baseRevision,
        baseFingerprint,
        baseSnapshot,
        inputFingerprint,
        generator,
        algorithmVersion,
        snapshot,
        unresolvedFacts,
      ),
      candidateRevision,
      generator,
      algorithmVersion,
    ),
    candidateId,
    candidateRevision,
    baseRevision,
    baseFingerprint,
    inputFingerprint,
    generator,
    algorithmVersion,
    unresolvedFacts,
    revision: candidateRevision,
  };
  const errors = validateCandidate(candidate, "integration candidate");
  if (errors.length > 0) throw new GraphValidationError(errors);
  return candidate;
}

function errorsForCandidateInputs(
  candidateId: string,
  generator: string,
  algorithmVersion: string,
  inputFingerprint: string,
  unresolvedFacts: readonly string[],
): void {
  const errors: string[] = [];
  errors.push(...requireNonEmptyString(candidateId, "integration candidate candidateId"));
  errors.push(...requireNonEmptyString(generator, "integration candidate generator"));
  errors.push(...requireNonEmptyString(algorithmVersion, "integration candidate algorithmVersion"));
  errors.push(...requireNonEmptyString(inputFingerprint, "integration candidate inputFingerprint"));
  unresolvedFacts.forEach((fact, index) => {
    if (typeof fact !== "string" || fact.length === 0) {
      errors.push("integration candidate unresolvedFacts[" + index + "] must be a non-empty string");
    }
  });
  if (errors.length > 0) throw new GraphValidationError(errors);
}

/** Add a candidate and advance only the container revision. */
export function createIntegrationCandidate(
  base: ArtworkGraph,
  input: IntegrationCandidateInput,
  options: IntegrationCandidateOptions = {},
): ArtworkGraph {
  assertStrictJsonBoundary(options, "integration candidate options");
  const source = assertValidArtworkGraph(base);
  const revision = nextRevision(source);
  if (options.revision !== undefined && options.revision !== revision) {
    throw new GraphValidationError([
      "integration candidate revision must equal the next artwork graph revision",
    ]);
  }
  const candidate = makeIntegrationCandidate(source, input, { ...options, revision });
  if (source.integrationCandidates.some((item) => item.candidateId === candidate.candidateId)) {
    throw new GraphValidationError([
      "integration candidate candidateId already exists: " + candidate.candidateId,
    ]);
  }
  const provenance = appendGraphProvenance(source.provenance, {
    source: "generated",
    intent: "generated",
    generator: candidate.generator,
    algorithmVersion: candidate.algorithmVersion,
    inputFingerprint: candidate.inputFingerprint,
    operation: "add-integration-candidate",
    revision,
  });
  const result: ArtworkGraph = {
    ...cloneGraphValue(source),
    revision,
    parentRevision: source.revision,
    lineage: [...source.lineage, revision],
    lifecycle: "candidate",
    provenance,
    state: "integrationCandidate",
    surfaceDraft: cloneGraphValue(source.surfaceDraft),
    integrationCandidates: [
      ...source.integrationCandidates.map((item) => cloneGraphValue(item)),
      candidate,
    ],
    integratedConfirmed: source.integratedConfirmed
      ? cloneGraphValue(source.integratedConfirmed)
      : null,
  };
  return assertValidArtworkGraph(result);
}

export const createArtworkIntegrationCandidate = createIntegrationCandidate;
export const proposeIntegrationCandidate = createIntegrationCandidate;
export const addIntegrationCandidate = createIntegrationCandidate;
export const buildArtworkIntegrationCandidate = makeIntegrationCandidate;

function candidateAt(
  graph: ArtworkGraph,
  candidateId: string,
  candidateRevision?: number,
): ArtworkIntegrationCandidate {
  const candidate = graph.integrationCandidates.find((item) => item.candidateId === candidateId);
  if (!candidate) {
    throw new GraphValidationError(["integration candidate not found: " + candidateId]);
  }
  if (candidateRevision !== undefined && candidate.candidateRevision !== candidateRevision) {
    throw new GraphValidationError([
      "integration candidate revision does not match candidateId: " + candidateId,
    ]);
  }
  if (candidate.lifecycle !== "candidate") {
    throw new GraphValidationError([
      "integration candidate is stale, rejected, confirmed, or no longer pending: " + candidateId,
    ]);
  }
  return candidate;
}

function markCandidate(
  candidate: ArtworkIntegrationCandidate,
  lifecycle: "confirmed" | "rejected" | "stale",
  operation: string,
  revision: number,
  snapshot?: ArtworkSnapshot,
): ArtworkIntegrationCandidate {
  const intent = lifecycle === "rejected" ? "manuallyDeleted" : "pinned";
  return {
    ...cloneGraphValue(candidate),
    ...(snapshot ? cloneGraphValue(snapshot) : {}),
    revision,
    parentRevision: candidate.revision,
    lineage: [...candidate.lineage, revision],
    lifecycle,
    provenance: appendGraphProvenance(candidate.provenance, {
      source: "author",
      intent,
      operation,
      revision,
    }),
  };
}

function authorTransitionProvenance(
  current: GraphProvenance,
  intent: "pinned" | "manuallyDeleted" | "manuallyMoved",
  operation: string,
  revision: number,
): GraphProvenance {
  return appendGraphProvenance(current, {
    source: "author",
    intent,
    operation,
    revision,
  });
}

function promoteRecord<T extends GraphRecordMetadata>(
  record: T,
  revision: number,
  operation: string,
): T {
  return {
    ...cloneGraphValue(record),
    revision,
    parentRevision: record.revision,
    lifecycle: "confirmed",
    provenance: authorTransitionProvenance(
      record.provenance,
      "pinned",
      operation,
      revision,
    ),
  };
}

function promoteSnapshot(
  candidate: ArtworkSnapshot,
  revision: number,
): ArtworkSnapshot {
  return {
    surface: cloneGraphValue(candidate.surface),
    interior: {
      kind: "interior-graph",
      nodes: candidate.interior.nodes.map((node) =>
        promoteRecord(node, revision, "accept-integration-candidate"),
      ),
      edges: candidate.interior.edges.map((edge) =>
        promoteRecord(edge, revision, "accept-integration-candidate"),
      ),
    },
    connections: candidate.connections.map((connection) =>
      promoteRecord(connection, revision, "accept-integration-candidate"),
    ),
  };
}

/** Accept exactly one current candidate; all other pending candidates become stale. */
export function acceptArtworkCandidate(
  graph: ArtworkGraph,
  candidateId: string,
  candidateRevision?: number,
): ArtworkGraph {
  const source = assertValidArtworkGraph(graph);
  const candidate = candidateAt(source, candidateId, candidateRevision);
  const authoritativeRevision = authoritativeActiveRevision(source);
  if (authoritativeRevision === undefined || candidate.baseRevision !== authoritativeRevision) {
    throw new GraphValidationError([
      "integration candidate baseRevision does not match the authoritative active snapshot revision",
    ]);
  }
  if (candidate.baseFingerprint !== activeSnapshotFingerprint(source)) {
    throw new GraphValidationError(["integration candidate is stale: " + candidateId]);
  }
  const revision = nextRevision(source);
  const promoted = promoteSnapshot(candidate, revision);
  const candidates = source.integrationCandidates.map((item) =>
    item.candidateId === candidateId
      ? markCandidate(item, "confirmed", "accept-integration-candidate", revision, promoted)
      : item.lifecycle === "candidate"
        ? markCandidate(item, "stale", "stale-after-integration-accept", revision)
        : cloneGraphValue(item),
  );
  const integratedConfirmed: IntegratedConfirmedArtwork = {
    ...promoted,
    id: "integrated-confirmed:" + candidate.candidateId + ":" + revision,
    kind: "artwork-confirmed-snapshot",
    schemaVersion: 1,
    revision,
    parentRevision: source.revision,
    lineage: [...source.lineage, revision],
    lifecycle: "confirmed",
    provenance: authorTransitionProvenance(
      candidate.provenance,
      "pinned",
      "accept-integration-candidate",
      revision,
    ),
    sourceCandidateId: candidate.candidateId,
  };
  const provenance = authorTransitionProvenance(
    source.provenance,
    "pinned",
    "accept-integration-candidate",
    revision,
  );
  const result: ArtworkGraph = {
    ...cloneGraphValue(source),
    revision,
    parentRevision: source.revision,
    lineage: [...source.lineage, revision],
    lifecycle: "confirmed",
    state: "integratedConfirmed",
    provenance,
    surfaceDraft: cloneGraphValue(source.surfaceDraft),
    integrationCandidates: candidates,
    integratedConfirmed,
  };
  return assertValidArtworkGraph(result);
}

export const acceptIntegrationCandidate = acceptArtworkCandidate;
export const acceptArtworkGraphCandidate = acceptArtworkCandidate;

/** Reject one candidate while retaining both active slots exactly. */
export function rejectArtworkCandidate(
  graph: ArtworkGraph,
  candidateId: string,
  candidateRevision?: number,
): ArtworkGraph {
  const source = assertValidArtworkGraph(graph);
  candidateAt(source, candidateId, candidateRevision);
  const revision = nextRevision(source);
  const candidates = source.integrationCandidates.map((item) => item.candidateId === candidateId
    ? markCandidate(item, "rejected", "reject-integration-candidate", revision)
    : cloneGraphValue(item));
  const state = expectedState(candidates, source.integratedConfirmed);
  const result: ArtworkGraph = {
    ...cloneGraphValue(source),
    revision,
    parentRevision: source.revision,
    lineage: [...source.lineage, revision],
    state,
    lifecycle: state === "integratedConfirmed" ? "confirmed" : "candidate",
    provenance: authorTransitionProvenance(
      source.provenance,
      "manuallyDeleted",
      "reject-integration-candidate",
      revision,
    ),
    surfaceDraft: cloneGraphValue(source.surfaceDraft),
    integrationCandidates: candidates,
    integratedConfirmed: source.integratedConfirmed
      ? cloneGraphValue(source.integratedConfirmed)
      : null,
  };
  return assertValidArtworkGraph(result);
}

export const rejectIntegrationCandidate = rejectArtworkCandidate;
export const rejectArtworkGraphCandidate = rejectArtworkCandidate;

/**
 * Replace the Surface draft without touching the confirmed slot.  Pending
 * candidates whose base active snapshot changed are explicitly stale.
 */
export function replaceSurfaceDraft(
  graph: ArtworkGraph,
  surfaceDraft: SurfaceGraph,
): ArtworkGraph {
  assertStrictJsonBoundary({ graph, surfaceDraft }, "surface draft replacement input");
  const source = assertValidArtworkGraph(graph);
  const replacement = assertValidSurfaceGraph(surfaceDraft);
  const revision = nextRevision(source);
  if (replacement.revision > revision) {
    throw new GraphValidationError([
      "surfaceDraft revision must not exceed the next artwork graph revision",
    ]);
  }
  const beforeFingerprint = activeSnapshotFingerprint(source);
  const provisional: ArtworkGraph = {
    ...cloneGraphValue(source),
    surfaceDraft: cloneGraphValue(replacement),
  };
  const afterFingerprint = activeSnapshotFingerprint(provisional);
  const candidates = source.integrationCandidates.map((item) =>
    item.lifecycle === "candidate" && beforeFingerprint !== afterFingerprint
      ? markCandidate(item, "stale", "stale-after-surface-draft-change", revision)
      : cloneGraphValue(item),
  );
  const state = expectedState(candidates, source.integratedConfirmed);
  const result: ArtworkGraph = {
    ...provisional,
    revision,
    parentRevision: source.revision,
    lineage: [...source.lineage, revision],
    lifecycle: state === "integratedConfirmed" ? "confirmed" : "candidate",
    state,
    provenance: authorTransitionProvenance(
      source.provenance,
      "manuallyMoved",
      "replace-surface-draft",
      revision,
    ),
    integrationCandidates: candidates,
  };
  return assertValidArtworkGraph(result);
}

export const setSurfaceDraft = replaceSurfaceDraft;
export const updateSurfaceDraft = replaceSurfaceDraft;

export function serializeArtworkGraph(graph: ArtworkGraph, _ignoredOptions?: unknown): string {
  const source = assertValidArtworkGraph(graph);
  if (_ignoredOptions !== undefined) {
    assertStrictJsonBoundary(_ignoredOptions, "artwork graph serialization options");
  }
  // Canonical ordering is part of this contract; callers cannot disable it.
  return canonicalStringify(canonicalArtworkValue(source), ARTWORK_CANONICAL_OPTIONS);
}

export function parseArtworkGraph(text: string): ArtworkGraph {
  if (typeof text !== "string") {
    throw new GraphValidationError(["artwork graph JSON must be a string"]);
  }
  const parsed = parseGraphJson(text);
  const result = validateArtworkGraph(parsed);
  return assertGraphValid(parsed as ArtworkGraph, result.ok ? [] : result.errors);
}

export async function fingerprintArtworkGraph(
  graph: ArtworkGraph,
  _ignoredOptions?: unknown,
): Promise<string> {
  if (_ignoredOptions !== undefined) {
    assertStrictJsonBoundary(_ignoredOptions, "artwork graph fingerprint options");
  }
  return fingerprintGraph(
    canonicalArtworkValue(assertValidArtworkGraph(graph)),
    ARTWORK_CANONICAL_OPTIONS,
  );
}

export function fingerprintArtworkSnapshot(snapshot: ArtworkSnapshot): string {
  assertStrictJsonBoundary(snapshot, "artwork snapshot");
  const errors = validateArtworkSnapshot(snapshot, "artwork snapshot");
  if (errors.length > 0) throw new GraphValidationError(errors);
  return snapshotFingerprint(snapshot);
}

export const serializeArtworkGraphSnapshot = serializeArtworkGraph;
export const parseArtworkGraphSnapshot = parseArtworkGraph;

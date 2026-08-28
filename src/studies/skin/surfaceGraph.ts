// ---------------------------------------------------------------------------
// SKIN Surface Graph — a semantic adapter over the current Patch facts.
//
// The adapter never repacks or rewrites a Patch.  It gives each current patch
// a stable author identity within its patch-set revision and keeps the
// generation-instance identity separate from any future realized geometry.
// Surface relations are intentionally their own edge type: a relation is a
// proposed/confirmed/rejected author meaning, not a printable strut.
// ---------------------------------------------------------------------------

import type { MotifShapeParams, Patch, PatchPoint } from "./field.ts";
import type { Sha256TestOptions } from "../../lib/hash.ts";
import {
  appendGraphProvenance,
  assertGraphValid,
  canonicalStringify,
  cloneGraphValue,
  fingerprintGraph,
  GraphValidationError,
  isFiniteNumber,
  isGraphLifecycle,
  isSafeNonNegativeInteger,
  parseGraphDocument,
  serializeGraphDocument,
  validateGraphDocument,
  validateFiniteNumbers,
  validateGraphMetadata,
  type GraphEndpointRecord,
  type GraphDocumentValidationOptions,
  type GraphLifecycle,
  type GraphProvenance,
  type GraphProvenanceFactInput,
  type GraphRecordMetadata,
  type GraphValidationResult,
} from "./graphCore.ts";

export type PatchSetRevision = number;
export type AuthorElementId = string;

export interface PatchInstanceId {
  patchSetRevision: PatchSetRevision;
  patchId: number;
}

export interface SurfacePatchNode extends GraphRecordMetadata {
  kind: "surface-patch";
  parentRevision: number | null;
  /** Stable author-facing identity, retained across direct edits in one set. */
  authorElementId: AuthorElementId;
  /** Generation identity; the pair is deliberately not reduced to patchId. */
  patchInstanceId: PatchInstanceId;
  /** Optional identity for a derived proxy/realization, never the author ID. */
  realizationIdentity?: string;
  /** The current legacy Patch is preserved as input facts. */
  patch: Patch;
}

/** Semantic Surface node name used by the typed Graph layers. */
export type SurfaceNode = SurfacePatchNode;

export type SurfaceRelationState = "proposed" | "confirmed" | "rejected";
export type SurfaceRelationKind = "contact" | "overlap" | "near" | "intentional";

export interface SurfaceRelationEdge extends GraphEndpointRecord {
  edgeType: "surface-relation";
  parentRevision: number | null;
  relation: SurfaceRelationKind;
  /** Explicit author-facing wording; candidate lifecycle is its proposed state. */
  relationState?: SurfaceRelationState;
}

export interface SurfaceGraph extends GraphRecordMetadata {
  kind: "surface-graph";
  schemaVersion: 1;
  parentRevision: number | null;
  lineage: readonly number[];
  patchSetRevision: PatchSetRevision;
  nodes: SurfacePatchNode[];
  edges: SurfaceRelationEdge[];
}

export interface SurfacePatchAdapterOptions {
  lifecycle?: GraphLifecycle;
  provenance?: GraphProvenance;
  revision?: number;
  parentRevision?: number | null;
  includeRealizationIdentity?: boolean;
}

export interface SurfaceGraphOptions extends SurfacePatchAdapterOptions {
  id?: string;
  parentRevision?: number | null;
  lineage?: readonly number[];
  graphLifecycle?: GraphLifecycle;
  graphProvenance?: GraphProvenance;
  nodeRevision?: number;
  nodeParentRevision?: number | null;
  relations?: readonly SurfaceRelationEdge[];
  /** Alias useful when a caller already names the collection `edges`. */
  edges?: readonly SurfaceRelationEdge[];
}

const PATCH_SHAPES = new Set(["coin", "flatRing", "ring3d", "flower"]);
const MOTIF_PLACEMENTS = new Set(["surface", "center", "inside"]);
const SURFACE_CELL_KINDS = new Set(["quad", "voronoi", "goldberg", "lace"]);
const POINT_ROLES = new Set(["motif", "bridge", "surfaceConnector"]);
const RELATION_KINDS = new Set<SurfaceRelationKind>(["contact", "overlap", "near", "intentional"]);
const RELATION_STATES = new Set<SurfaceRelationState>(["proposed", "confirmed", "rejected"]);

const PATCH_POINT_KEYS = [
  "x", "y", "z", "r", "role", "baseR", "fusionBaseR", "fusionR", "meshJoinR", "contactR", "contactScale",
  "ringPrimary",
] as const satisfies readonly (keyof PatchPoint)[];
const PATCH_KEYS = [
  "id", "shape", "motifPlacement", "ringDiameter", "quadCellId", "surfaceCellId", "surfaceCellKind", "motifParams", "points",
] as const satisfies readonly (keyof Patch)[];
const MOTIF_SHAPE_PARAMS_KEYS = [
  "irregularity", "coinHoleRatio", "flatRingHoleRatio", "ringNodeCount", "ringTubeR", "ringWobbleR", "ringWobblePos",
  "flowerMotifPreset", "flowerPetalCount", "flowerShowCore", "flowerOpening", "flowerNeck", "flowerCoreSize",
  "flowerCupping", "flowerCoreLift", "flowerGrowthDifference", "flowerExpansion",
] as const satisfies readonly (keyof MotifShapeParams)[];

type ExhaustiveKeys<T, Keys extends readonly (keyof T)[]> =
  Exclude<keyof T, Keys[number]> extends never ? true : false;
const PATCH_POINT_KEYS_ARE_EXHAUSTIVE: ExhaustiveKeys<PatchPoint, typeof PATCH_POINT_KEYS> = true;
const PATCH_KEYS_ARE_EXHAUSTIVE: ExhaustiveKeys<Patch, typeof PATCH_KEYS> = true;
const MOTIF_SHAPE_PARAMS_KEYS_ARE_EXHAUSTIVE: ExhaustiveKeys<MotifShapeParams, typeof MOTIF_SHAPE_PARAMS_KEYS> = true;

// Keep the compile-time guards above live in emitted type-checks without
// creating runtime behavior or allowing a future field to be silently lost.
void PATCH_POINT_KEYS_ARE_EXHAUSTIVE;
void PATCH_KEYS_ARE_EXHAUSTIVE;
void MOTIF_SHAPE_PARAMS_KEYS_ARE_EXHAUSTIVE;

const FLOWER_MOTIF_PRESETS = new Set(["four-core", "six-core", "ten-ring", "twelve-core", "custom"]);
const FLOWER_PETAL_COUNTS = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

const GENERATED_PATCH_PROVENANCE: GraphProvenance = {
  source: "generated",
  intent: "generated",
  generator: "surface-graph-adapter",
  algorithmVersion: "surface-graph-v1",
  inputFingerprint: "legacy-patch-adapter",
  operation: "legacy-patch-adapter",
  revision: 0,
};

const SURFACE_GRAPH_CORE_VALIDATION: GraphDocumentValidationOptions<SurfaceRelationEdge> = {
  typedEdgeDescriptors: [{
    collectionPath: "edges",
    endpointSelector: (edge) => ({ from: edge.from, to: edge.to }),
  }],
};

const SURFACE_GRAPH_CANONICAL_OPTIONS = {
  entityCollectionPaths: ["nodes", "edges"],
  sortGraphEntityCollections: true,
} as const;

function token(value: PatchSetRevision | number): string {
  return encodeURIComponent(String(value));
}

function compareStableIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSurfaceNodes(left: SurfacePatchNode, right: SurfacePatchNode): number {
  const byId = compareStableIds(left.authorElementId, right.authorElementId);
  if (byId !== 0) return byId;
  return compareStableIds(canonicalStringify(left.patch), canonicalStringify(right.patch));
}

function generatedProvenance(
  revision: number,
  inputFingerprint: string,
  operation: string,
): GraphProvenance {
  return {
    ...cloneGraphValue(GENERATED_PATCH_PROVENANCE),
    inputFingerprint,
    operation,
    revision,
  };
}

function generatedProvenanceFact(
  revision: number,
  inputFingerprint: string,
  operation: string,
): GraphProvenanceFactInput {
  return {
    source: "generated",
    intent: "generated",
    generator: "surface-graph-adapter",
    algorithmVersion: "surface-graph-v1",
    inputFingerprint,
    operation,
    revision,
  };
}

/** Deterministic and revision-scoped; direct edits do not call this differently. */
export function makeAuthorElementId(patchSetRevision: PatchSetRevision, patchId: number): string {
  return `surface-author:${token(patchSetRevision)}:${token(patchId)}`;
}

export function makePatchInstanceId(patchSetRevision: PatchSetRevision, patchId: number): PatchInstanceId {
  return { patchSetRevision, patchId };
}

function derivedRealizationIdentity(patchInstanceId: PatchInstanceId, patch: Patch): string {
  // This is an identity, not a print/geometry proof.  Canonical facts make it
  // stable while a direct edit changes only this derived realization identity.
  return `surface-realization:${canonicalStringify({ patchInstanceId, patch })}`;
}

function unknownPatchKeys(value: object, allowed: readonly string[], path: string): string[] {
  const allowedSet = new Set(allowed);
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) errors.push(`${path}.${key} is not a recognized persisted Patch fact`);
    if ((value as Record<string, unknown>)[key] === undefined) {
      errors.push(`${path}.${key} must be omitted rather than explicitly undefined`);
    }
  }
  return errors;
}

function numberFieldErrors(
  value: Record<string, unknown>,
  field: string,
  path: string,
  options: { required?: boolean; integer?: boolean; nonNegative?: boolean } = {},
): string[] {
  const fieldValue = value[field];
  if (fieldValue === undefined) {
    return options.required ? [`${path}.${field} must be a finite number`] : [];
  }
  const errors: string[] = [];
  if (!isFiniteNumber(fieldValue)) {
    errors.push(`${path}.${field} must be finite`);
    return errors;
  }
  if (options.integer && !Number.isSafeInteger(fieldValue)) {
    errors.push(`${path}.${field} must be a finite safe integer`);
  }
  if (options.nonNegative && fieldValue < 0) {
    errors.push(`${path}.${field} must be non-negative`);
  }
  return errors;
}

function booleanFieldErrors(value: Record<string, unknown>, field: string, path: string, required = false): string[] {
  const fieldValue = value[field];
  if (fieldValue === undefined) return required ? [`${path}.${field} must be a boolean`] : [];
  return typeof fieldValue === "boolean" ? [] : [`${path}.${field} must be a boolean`];
}

function stringEnumFieldErrors(
  value: Record<string, unknown>,
  field: string,
  allowed: ReadonlySet<string>,
  path: string,
  required = false,
): string[] {
  const fieldValue = value[field];
  if (fieldValue === undefined) return required ? [`${path}.${field} is required`] : [];
  return typeof fieldValue === "string" && allowed.has(fieldValue)
    ? []
    : [`${path}.${field} is invalid`];
}

function motifShapeParamsErrors(value: unknown, path: string): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [`${path} must be an object when present`];
  }
  const record = value as Record<string, unknown>;
  const errors = unknownPatchKeys(record, MOTIF_SHAPE_PARAMS_KEYS, path);
  const numericFields = [
    "irregularity", "flatRingHoleRatio", "ringTubeR", "ringWobbleR", "ringWobblePos", "flowerOpening", "flowerNeck",
    "flowerCoreSize", "flowerCupping", "flowerCoreLift", "flowerGrowthDifference", "flowerExpansion",
  ] as const;
  for (const field of numericFields) errors.push(...numberFieldErrors(record, field, path, { required: true }));
  errors.push(...numberFieldErrors(record, "coinHoleRatio", path));
  errors.push(...numberFieldErrors(record, "ringNodeCount", path, { required: true, integer: true, nonNegative: true }));
  errors.push(...stringEnumFieldErrors(record, "flowerMotifPreset", FLOWER_MOTIF_PRESETS, path, true));
  const flowerPetalCount = record.flowerPetalCount;
  if (flowerPetalCount === undefined) {
    errors.push(`${path}.flowerPetalCount is required`);
  } else if (!isSafeNonNegativeInteger(flowerPetalCount) || !FLOWER_PETAL_COUNTS.has(flowerPetalCount)) {
    errors.push(`${path}.flowerPetalCount is invalid`);
  }
  errors.push(...booleanFieldErrors(record, "flowerShowCore", path, true));
  return errors;
}

function patchFactsErrors(patch: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return [`${path} must be an object`];
  const value = patch as Record<string, unknown>;
  errors.push(...unknownPatchKeys(value, PATCH_KEYS, path));
  if (!isSafeNonNegativeInteger(value.id)) errors.push(`${path}.id must be a finite non-negative safe integer`);
  errors.push(...stringEnumFieldErrors(value, "shape", PATCH_SHAPES, path, true));
  errors.push(...stringEnumFieldErrors(value, "motifPlacement", MOTIF_PLACEMENTS, path));
  errors.push(...numberFieldErrors(value, "ringDiameter", path, { nonNegative: true }));
  errors.push(...numberFieldErrors(value, "quadCellId", path, { integer: true, nonNegative: true }));
  errors.push(...numberFieldErrors(value, "surfaceCellId", path, { integer: true, nonNegative: true }));
  errors.push(...stringEnumFieldErrors(value, "surfaceCellKind", SURFACE_CELL_KINDS, path));
  if (value.motifParams !== undefined) errors.push(...motifShapeParamsErrors(value.motifParams, `${path}.motifParams`));
  if (!Array.isArray(value.points) || value.points.length === 0) {
    errors.push(`${path}.points must be a non-empty array`);
  } else {
    for (let index = 0; index < value.points.length; index += 1) {
      const point = value.points[index];
      const pointPath = `${path}.points[${index}]`;
      if (!point || typeof point !== "object" || Array.isArray(point)) {
        errors.push(`${pointPath} must be an object`);
        continue;
      }
      const item = point as Record<string, unknown>;
      errors.push(...unknownPatchKeys(item, PATCH_POINT_KEYS, pointPath));
      for (const field of ["x", "y", "z"] as const) {
        errors.push(...numberFieldErrors(item, field, pointPath, { required: true }));
      }
      errors.push(...numberFieldErrors(item, "r", pointPath, { required: true, nonNegative: true }));
      errors.push(...stringEnumFieldErrors(item, "role", POINT_ROLES, pointPath));
      for (const field of ["baseR", "fusionBaseR", "fusionR", "meshJoinR", "contactR", "contactScale"] as const) {
        errors.push(...numberFieldErrors(item, field, pointPath, { nonNegative: true }));
      }
      errors.push(...booleanFieldErrors(item, "ringPrimary", pointPath));
    }
  }
  return errors;
}

function assertPatchFacts(patch: Patch): Patch {
  const errors = patchFactsErrors(patch, "patch");
  try {
    // Validate the exact input facts without normalizing or regenerating the
    // Patch. This rejects values canonical JSON would otherwise drop/coerce.
    canonicalStringify(patch);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "patch is not persistable JSON");
  }
  if (errors.length > 0) throw new GraphValidationError(errors);
  return patch;
}

function relationStateForLifecycle(lifecycle: GraphLifecycle): SurfaceRelationState | undefined {
  if (lifecycle === "candidate") return "proposed";
  if (lifecycle === "confirmed") return "confirmed";
  if (lifecycle === "rejected") return "rejected";
  return undefined;
}

function lifecycleForRelationState(state: SurfaceRelationState): GraphLifecycle {
  if (state === "proposed") return "candidate";
  if (state === "confirmed") return "confirmed";
  return "rejected";
}

function relationFactFingerprint(edge: Pick<SurfaceRelationEdge, "id" | "from" | "to" | "relation">): string {
  return canonicalStringify({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    relation: edge.relation,
  });
}

function relationTransitionProvenance(
  edge: Pick<SurfaceRelationEdge, "id" | "from" | "to" | "relation">,
  lifecycle: GraphLifecycle,
  revision: number,
): GraphProvenanceFactInput {
  if (lifecycle === "confirmed") {
    return {
      source: "author",
      intent: "pinned",
      operation: "confirm-surface-relation",
      revision,
    };
  }
  if (lifecycle === "rejected") {
    return {
      source: "author",
      intent: "manuallyDeleted",
      operation: "reject-surface-relation",
      revision,
    };
  }
  return generatedProvenanceFact(
    revision,
    relationFactFingerprint(edge),
    lifecycle === "candidate" ? "propose-surface-relation" : "stale-surface-relation",
  );
}

function directRelationProvenanceErrors(
  provenance: unknown,
  lifecycle: unknown,
  path: string,
): string[] {
  if (lifecycle !== "confirmed" && lifecycle !== "rejected") return [];
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) return [];
  const expectedIntent = lifecycle === "confirmed" ? "pinned" : "manuallyDeleted";
  const record = provenance as Partial<GraphProvenance>;
  const errors: string[] = [];
  if (record.source !== "author" || record.intent !== expectedIntent) {
    errors.push(`${path} direct ${lifecycle} relations require author ${expectedIntent} provenance`);
  }
  const history = Array.isArray(record.history) ? record.history : [];
  const hasGeneratedPredecessor = history.some((fact) =>
    fact !== null && typeof fact === "object" && !Array.isArray(fact) &&
    (fact as Partial<GraphProvenance>).source === "generated" &&
    (fact as Partial<GraphProvenance>).intent === "generated",
  );
  if (!hasGeneratedPredecessor) {
    errors.push(`${path} direct ${lifecycle} relations require a generated provenance predecessor`);
  }
  return errors;
}

function nextSurfaceRevision(source: Pick<SurfaceGraph, "revision">): number {
  if (source.revision >= Number.MAX_SAFE_INTEGER) {
    throw new GraphValidationError([
      "surface graph revision cannot advance beyond Number.MAX_SAFE_INTEGER",
    ]);
  }
  const revision = source.revision + 1;
  if (!isSafeNonNegativeInteger(revision)) {
    throw new GraphValidationError([
      "next surface graph revision must be a finite non-negative safe integer",
    ]);
  }
  return revision;
}

function advanceSurfaceGraph(
  source: SurfaceGraph,
  revision: number,
  provenance: GraphProvenance,
  edges: readonly SurfaceRelationEdge[],
): SurfaceGraph {
  return assertValidSurfaceGraph({
    ...cloneGraphValue(source),
    revision,
    parentRevision: source.revision,
    lineage: [...source.lineage, revision],
    provenance,
    edges: edges.map((edge) => cloneGraphValue(edge)),
  });
}

export function adaptPatchToSurfaceNode(
  patch: Patch,
  patchSetRevision: PatchSetRevision,
  options: SurfacePatchAdapterOptions = {},
): SurfacePatchNode {
  assertPatchFacts(patch);
  if (!isSafeNonNegativeInteger(patchSetRevision)) {
    throw new Error("Surface patch validation failed: patchSetRevision is invalid");
  }
  const revision = options.revision ?? 0;
  if (!isSafeNonNegativeInteger(revision)) {
    throw new GraphValidationError(["surface node revision must be a finite non-negative safe integer"]);
  }
  const parentRevision = options.parentRevision ?? null;
  const patchInstanceId = makePatchInstanceId(patchSetRevision, patch.id);
  const authorElementId = makeAuthorElementId(patchSetRevision, patch.id);
  const includeRealizationIdentity = options.includeRealizationIdentity !== false;
  const clonedPatch = cloneGraphValue(patch);
  const node: SurfacePatchNode = {
    id: authorElementId,
    kind: "surface-patch",
    authorElementId,
    patchInstanceId,
    ...(includeRealizationIdentity ? { realizationIdentity: derivedRealizationIdentity(patchInstanceId, clonedPatch) } : {}),
    revision,
    parentRevision,
    lifecycle: options.lifecycle ?? "confirmed",
    provenance: cloneGraphValue(options.provenance ?? generatedProvenance(
      revision,
      canonicalStringify(clonedPatch),
      "surface-patch-adapter",
    )),
    patch: clonedPatch,
  };
  const metadataErrors = validateMetadataAndNodeIdentity(node, "surface node", patchSetRevision);
  if (metadataErrors.length > 0) throw new GraphValidationError(metadataErrors);
  return node;
}

export function createSurfaceRelationEdge(
  id: string,
  from: string,
  to: string,
  options: {
    relation?: SurfaceRelationKind;
    lifecycle?: GraphLifecycle;
    relationState?: SurfaceRelationState;
    revision?: number;
    parentRevision?: number | null;
    provenance?: GraphProvenance;
  } = {},
): SurfaceRelationEdge {
  const lifecycle = options.lifecycle ?? (options.relationState ? lifecycleForRelationState(options.relationState) : "candidate");
  const relationState = options.relationState ?? relationStateForLifecycle(lifecycle);
  const revision = options.revision ?? 0;
  if (!isSafeNonNegativeInteger(revision)) {
    throw new GraphValidationError(["surface relation revision must be a finite non-negative safe integer"]);
  }
  const edge: SurfaceRelationEdge = {
    id,
    edgeType: "surface-relation",
    from,
    to,
    relation: options.relation ?? "near",
    ...(relationState ? { relationState } : {}),
    revision,
    parentRevision: options.parentRevision ?? null,
    lifecycle,
    provenance: cloneGraphValue(options.provenance ?? generatedProvenance(
      revision,
      canonicalStringify({ id, from, to, relation: options.relation ?? "near" }),
      "surface-relation",
    )),
  };
  const errors = validateSurfaceRelation(edge, "surface relation", new Set<string>());
  // Endpoints are intentionally checked by the containing graph because this
  // constructor does not know its node set.  All other edge/core facts are
  // still rejected at construction time.
  const endpointErrors = errors.filter((error) =>
    error.includes("dangling surface endpoint"),
  );
  const nonEndpointErrors = errors.filter((error) => !endpointErrors.includes(error));
  if (nonEndpointErrors.length > 0) throw new GraphValidationError(nonEndpointErrors);
  return edge;
}

function uniqueIds(records: readonly { id: string }[], path: string): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  records.forEach((record, index) => {
    if (!record || typeof record.id !== "string" || record.id.length === 0) return;
    if (seen.has(record.id)) errors.push(`${path}[${index}].id duplicates ${record.id}`);
    seen.add(record.id);
  });
  return errors;
}

export function validateSurfaceGraph(value: unknown): GraphValidationResult<SurfaceGraph> {
  const errors: string[] = [];
  const coreResult = validateGraphDocument(value, SURFACE_GRAPH_CORE_VALIDATION);
  if (!coreResult.ok) errors.push(...coreResult.errors);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: [...new Set(errors.length > 0 ? errors : ["surface graph must be an object"])] };
  }
  const graph = value as Partial<SurfaceGraph>;
  errors.push(...validateGraphMetadata(value, "surface graph", { requireParentRevision: true }));
  errors.push(...metadataRevisionProvenanceErrors(graph, "surface graph"));
  if (graph.kind !== "surface-graph") errors.push("surface graph kind is invalid");
  if (graph.schemaVersion !== 1) errors.push("surface graph schemaVersion is invalid");
  if (!isSafeNonNegativeInteger(graph.revision)) errors.push("surface graph revision is invalid");
  if (!isSafeNonNegativeInteger(graph.patchSetRevision)) {
    errors.push("surface graph patchSetRevision is invalid");
  }
  if (!Array.isArray(graph.nodes)) errors.push("surface graph nodes must be an array");
  if (!Array.isArray(graph.edges)) errors.push("surface graph edges must be an array");
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return { ok: false, errors };

  errors.push(...uniqueIds(graph.nodes as Array<{ id: string }>, "surface graph nodes"));
  const nodeIds = new Set<string>();
  for (let index = 0; index < graph.nodes.length; index += 1) {
    const node = graph.nodes[index] as unknown;
    const path = `surface graph nodes[${index}]`;
    errors.push(...patchFactsErrors((node as SurfacePatchNode)?.patch, `${path}.patch`));
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    const metadataErrors = validateMetadataAndNodeIdentity(node, path, graph.patchSetRevision);
    errors.push(...metadataErrors);
    const nodeRevision = (node as Partial<SurfacePatchNode>).revision;
    const graphRevision = graph.revision;
    if (isSafeNonNegativeInteger(nodeRevision) &&
      isSafeNonNegativeInteger(graphRevision) &&
      nodeRevision > graphRevision) {
      errors.push(`${path}.revision must not exceed surface graph revision`);
    }
    const id = (node as Partial<SurfacePatchNode>).id;
    if (typeof id === "string") nodeIds.add(id);
  }

  const edgeIds = new Set<string>();
  for (let index = 0; index < graph.edges.length; index += 1) {
    const edge = graph.edges[index] as unknown;
    const path = `surface graph edges[${index}]`;
    errors.push(...validateSurfaceRelation(edge, path, nodeIds));
    const edgeRevision = edge && typeof edge === "object" && !Array.isArray(edge)
      ? (edge as Partial<SurfaceRelationEdge>).revision
      : undefined;
    const graphRevision = graph.revision;
    if (isSafeNonNegativeInteger(edgeRevision) &&
      isSafeNonNegativeInteger(graphRevision) &&
      edgeRevision > graphRevision) {
      errors.push(`${path}.revision must not exceed surface graph revision`);
    }
    if (edge && typeof edge === "object" && !Array.isArray(edge) && typeof (edge as Partial<SurfaceRelationEdge>).id === "string") {
      const id = (edge as Partial<SurfaceRelationEdge>).id as string;
      if (edgeIds.has(id)) errors.push(`${path}.id duplicates ${id}`);
      edgeIds.add(id);
      if (nodeIds.has(id)) errors.push(`${path}.id collides with a node id ${id}`);
    }
  }
  errors.push(...validateFiniteNumbersForGraph(value));
  return errors.length > 0
    ? { ok: false, errors: [...new Set(errors)] }
    : { ok: true, value: value as SurfaceGraph, errors: [] };
}

function validateFiniteNumbersForGraph(value: unknown): string[] {
  return validateFiniteNumbers(value, "surface graph");
}

function validateMetadataAndNodeIdentity(value: unknown, path: string, graphRevision: PatchSetRevision | undefined): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path} must be an object`];
  const node = value as Partial<SurfacePatchNode>;
  errors.push(...validateGraphMetadata(value, path, { requireParentRevision: true }));
  errors.push(...metadataRevisionProvenanceErrors(node, path));
  if (node.kind !== "surface-patch") errors.push(`${path}.kind is invalid`);
  if (typeof node.authorElementId !== "string" || node.authorElementId.length === 0) errors.push(`${path}.authorElementId is invalid`);
  if (!node.patchInstanceId || typeof node.patchInstanceId !== "object" || Array.isArray(node.patchInstanceId)) {
    errors.push(`${path}.patchInstanceId must be an object`);
  } else {
    const instance = node.patchInstanceId as Partial<PatchInstanceId>;
    if (instance.patchSetRevision !== graphRevision) errors.push(`${path}.patchInstanceId.patchSetRevision does not match graph patchSetRevision`);
    if (!isSafeNonNegativeInteger(instance.patchId)) errors.push(`${path}.patchInstanceId.patchId is invalid`);
    if (isFiniteNumber(instance.patchId) && typeof node.patch === "object" && node.patch && instance.patchId !== node.patch.id) {
      errors.push(`${path}.patchInstanceId.patchId does not match patch.id`);
    }
  }
  if (typeof node.authorElementId === "string" && node.patchInstanceId && typeof node.patchInstanceId === "object") {
    const instance = node.patchInstanceId as PatchInstanceId;
    if (makeAuthorElementId(instance.patchSetRevision, instance.patchId) !== node.authorElementId) errors.push(`${path}.authorElementId is not deterministic for patchInstanceId`);
    if (node.id !== node.authorElementId) errors.push(`${path}.id must equal authorElementId`);
  }
  if (node.realizationIdentity !== undefined && (typeof node.realizationIdentity !== "string" || node.realizationIdentity.length === 0)) {
    errors.push(`${path}.realizationIdentity is invalid when present`);
  }
  return errors;
}

function validateSurfaceRelation(value: unknown, path: string, nodeIds: Set<string>): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path} must be an object`];
  const edge = value as Partial<SurfaceRelationEdge>;
  errors.push(...validateGraphMetadata(edge, path, { requireParentRevision: true }));
  errors.push(...metadataRevisionProvenanceErrors(edge, path));
  if (edge.edgeType !== "surface-relation") errors.push(`${path}.edgeType is invalid`);
  if (typeof edge.from !== "string" || !nodeIds.has(edge.from)) errors.push(`${path}.from is a dangling surface endpoint`);
  if (typeof edge.to !== "string" || !nodeIds.has(edge.to)) errors.push(`${path}.to is a dangling surface endpoint`);
  if (typeof edge.relation !== "string" || !RELATION_KINDS.has(edge.relation as SurfaceRelationKind)) errors.push(`${path}.relation is invalid`);
  if (edge.relationState !== undefined && !RELATION_STATES.has(edge.relationState)) errors.push(`${path}.relationState is invalid`);
  if (edge.lifecycle !== "stale" && edge.relationState === undefined) {
    errors.push(`${path}.non-stale relation must have relationState`);
  }
  if (edge.relationState === "proposed" && edge.lifecycle !== "candidate") errors.push(`${path}.proposed relation must have candidate lifecycle`);
  if (edge.relationState === "confirmed" && edge.lifecycle !== "confirmed") errors.push(`${path}.confirmed relation must have confirmed lifecycle`);
  if (edge.relationState === "rejected" && edge.lifecycle !== "rejected") errors.push(`${path}.rejected relation must have rejected lifecycle`);
  if (edge.lifecycle === "stale" && edge.relationState !== undefined) errors.push(`${path}.stale relation must not have relationState`);
  if (isGraphLifecycle(edge.lifecycle)) {
    errors.push(...directRelationProvenanceErrors(edge.provenance, edge.lifecycle, `${path}.provenance`));
  }
  return errors;
}

function metadataRevisionProvenanceErrors(
  value: Partial<GraphRecordMetadata>,
  path: string,
): string[] {
  if (!isSafeNonNegativeInteger(value.revision) || !value.provenance ||
    typeof value.provenance !== "object" || Array.isArray(value.provenance)) {
    return [];
  }
  const provenanceRevision = value.provenance.revision;
  if (provenanceRevision !== undefined && provenanceRevision !== value.revision) {
    return [`${path}.provenance.revision must match ${path}.revision when present`];
  }
  return [];
}

export function assertValidSurfaceGraph(graph: SurfaceGraph): SurfaceGraph {
  const result = validateSurfaceGraph(graph);
  return assertGraphValid(graph, result.ok ? [] : result.errors);
}

export function isSurfaceGraph(value: unknown): value is SurfaceGraph {
  return validateSurfaceGraph(value).ok;
}

export function createSurfaceGraph(
  patches: readonly Patch[],
  patchSetRevision: PatchSetRevision,
  options: SurfaceGraphOptions = {},
): SurfaceGraph {
  const graphRevision = options.revision ?? 0;
  if (!isSafeNonNegativeInteger(graphRevision)) {
    throw new GraphValidationError(["surface graph revision must be a finite non-negative safe integer"]);
  }
  if (!isSafeNonNegativeInteger(patchSetRevision)) {
    throw new GraphValidationError(["surface graph patchSetRevision must be a finite non-negative safe integer"]);
  }
  const nodes = patches.map((patch) => adaptPatchToSurfaceNode(patch, patchSetRevision, {
    lifecycle: options.lifecycle,
    provenance: options.provenance,
    revision: options.nodeRevision ?? 0,
    parentRevision: options.nodeParentRevision ?? null,
    includeRealizationIdentity: options.includeRealizationIdentity,
  })).sort(compareSurfaceNodes);
  const parentRevision = options.parentRevision ?? null;
  const lineage = options.lineage
    ? [...options.lineage]
    : parentRevision === null
      ? [graphRevision]
      : [parentRevision, graphRevision];
  const inputFingerprint = canonicalStringify({
    patchSetRevision,
    patches: nodes.map((node) => ({
      authorElementId: node.authorElementId,
      patchInstanceId: node.patchInstanceId,
      patch: node.patch,
    })),
  });
  const graph: SurfaceGraph = {
    id: options.id ?? `surface-graph:${token(patchSetRevision)}`,
    kind: "surface-graph",
    schemaVersion: 1,
    revision: graphRevision,
    parentRevision,
    lineage,
    lifecycle: options.graphLifecycle ?? "candidate",
    provenance: cloneGraphValue(options.graphProvenance ?? generatedProvenance(
      graphRevision,
      inputFingerprint,
      "surface-patch-adapter",
    )),
    patchSetRevision,
    nodes,
    edges: [...(options.edges ?? options.relations ?? [])].map((edge) => cloneGraphValue(edge)),
  };
  return assertValidSurfaceGraph(graph);
}

export const adaptPatchesToSurfaceGraph = createSurfaceGraph;
export const surfaceGraphFromPatches = createSurfaceGraph;

export function serializeSurfaceGraph(graph: SurfaceGraph): string {
  const source = assertValidSurfaceGraph(graph);
  return serializeGraphDocument(source, {
    validation: SURFACE_GRAPH_CORE_VALIDATION,
    canonical: SURFACE_GRAPH_CANONICAL_OPTIONS,
  });
}

export function parseSurfaceGraph(text: string): SurfaceGraph {
  const parsed = parseGraphDocument<SurfaceGraph, SurfaceRelationEdge>(text, SURFACE_GRAPH_CORE_VALIDATION);
  return assertValidSurfaceGraph(parsed);
}

export async function fingerprintSurfaceGraph(
  graph: SurfaceGraph,
  options?: Sha256TestOptions,
): Promise<string> {
  const hashOptions = options?.forceFallback === undefined
    ? SURFACE_GRAPH_CANONICAL_OPTIONS
    : { ...SURFACE_GRAPH_CANONICAL_OPTIONS, forceFallback: options.forceFallback };
  return fingerprintGraph(assertValidSurfaceGraph(graph), hashOptions);
}

export function setSurfaceRelationLifecycle(
  graph: SurfaceGraph,
  edgeId: string,
  lifecycle: GraphLifecycle,
): SurfaceGraph {
  if (!isGraphLifecycle(lifecycle)) {
    throw new GraphValidationError(["surface relation lifecycle is invalid"]);
  }
  const source = assertValidSurfaceGraph(graph);
  const target = source.edges.find((edge) => edge.id === edgeId);
  if (!target) throw new Error(`Surface relation not found: ${edgeId}`);
  const relationState = relationStateForLifecycle(lifecycle);
  const revision = nextSurfaceRevision(source);
  const transitionFact = relationTransitionProvenance(target, lifecycle, revision);
  const targetProvenance = appendGraphProvenance(target.provenance, transitionFact);
  const graphProvenance = appendGraphProvenance(
    source.provenance,
    relationTransitionProvenance(target, lifecycle, revision),
  );
  const edges = source.edges.map((edge) => {
    if (edge.id !== edgeId) return cloneGraphValue(edge);
    const updated = cloneGraphValue(edge);
    delete updated.relationState;
    return {
      ...updated,
      lifecycle,
      ...(relationState ? { relationState } : {}),
      revision,
      parentRevision: edge.revision,
      provenance: targetProvenance,
    };
  });
  return advanceSurfaceGraph(source, revision, graphProvenance, edges);
}

/** Purely append a new proposed relation without mutating the source graph. */
export function addSurfaceRelation(
  graph: SurfaceGraph,
  edge: SurfaceRelationEdge,
): SurfaceGraph {
  const source = assertValidSurfaceGraph(graph);
  const nodeIds = new Set(source.nodes.map((node) => node.id));
  const candidate = cloneGraphValue(edge);
  const candidateErrors = validateSurfaceRelation(candidate, "surface relation", nodeIds);
  if (candidateErrors.length > 0) throw new GraphValidationError(candidateErrors);
  if (candidate.lifecycle !== "candidate" ||
    (candidate.relationState !== undefined && candidate.relationState !== "proposed")) {
    throw new GraphValidationError([
      "surface relation additions must have candidate lifecycle and proposed relationState",
    ]);
  }
  const revision = nextSurfaceRevision(source);
  const candidateProvenance = appendGraphProvenance(
    candidate.provenance,
    relationTransitionProvenance(candidate, "candidate", revision),
  );
  const graphProvenance = appendGraphProvenance(
    source.provenance,
    relationTransitionProvenance(candidate, "candidate", revision),
  );
  const nextCandidate: SurfaceRelationEdge = {
    ...candidate,
    revision,
    parentRevision: null,
    lifecycle: "candidate",
    relationState: "proposed",
    provenance: candidateProvenance,
  };
  return advanceSurfaceGraph(source, revision, graphProvenance, [
    ...source.edges.map((item) => cloneGraphValue(item)),
    nextCandidate,
  ]);
}

export const proposeSurfaceRelation = (
  graph: SurfaceGraph,
  edgeId: string,
): SurfaceGraph => setSurfaceRelationLifecycle(graph, edgeId, "candidate");

export const confirmSurfaceRelation = (graph: SurfaceGraph, edgeId: string): SurfaceGraph =>
  setSurfaceRelationLifecycle(graph, edgeId, "confirmed");

export const rejectSurfaceRelation = (graph: SurfaceGraph, edgeId: string): SurfaceGraph =>
  setSurfaceRelationLifecycle(graph, edgeId, "rejected");

/**
 * Return connected components using only confirmed Surface relations.  Nodes
 * with no confirmed relation remain visible as singleton components; proposed
 * and rejected relations cannot make a component appear connected.
 */
export function confirmedSurfaceComponents(graph: SurfaceGraph): string[][] {
  const source = assertValidSurfaceGraph(graph);
  const compareIds = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;
  const ids = source.nodes.map((node) => node.id).sort(compareIds);
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) {
      current = parent.get(current) as string;
    }
    let compress = id;
    while (parent.get(compress) !== compress) {
      const next = parent.get(compress) as string;
      parent.set(compress, current);
      compress = next;
    }
    return current;
  };
  const union = (left: string, right: string): void => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  };
  for (const edge of source.edges) {
    if (edge.lifecycle === "confirmed" && (edge.relationState === undefined || edge.relationState === "confirmed")) union(edge.from, edge.to);
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const group = groups.get(root);
    if (group) group.push(id);
    else groups.set(root, [id]);
  }
  return [...groups.values()].sort((a, b) => compareIds(a[0] ?? "", b[0] ?? ""));
}

export const getConfirmedSurfaceComponents = confirmedSurfaceComponents;

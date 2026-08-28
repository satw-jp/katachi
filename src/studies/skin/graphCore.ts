// ---------------------------------------------------------------------------
// SKIN Graph Core
//
// This module owns only the graph-management contract shared by future typed
// graph layers: identity, revision lineage, provenance, lifecycle, validation,
// canonical persistence, and fingerprints.  It intentionally does not define
// a semantic edge.  Surface relations, interior struts, and artwork
// connections must remain distinct types in the layer that gives them meaning.
// ---------------------------------------------------------------------------

import { sha256Hex, type Sha256TestOptions } from "../../lib/hash.ts";

export const GRAPH_CORE_SCHEMA_VERSION = 1 as const;

export type GraphLifecycle = "candidate" | "confirmed" | "rejected" | "stale";

/**
 * The five author/provenance intents are deliberately kept as separate
 * literals.  A record keeps its current fact plus an ordered history of prior
 * facts, so a generated node that was later pinned and moved does not lose the
 * earlier ownership information.
 */
export type GraphProvenanceIntent =
  | "generated"
  | "pinned"
  | "manuallyMoved"
  | "manuallyAdded"
  | "manuallyDeleted";

export type GraphProvenanceSource = "generated" | "author";

export interface GraphProvenanceFact {
  source: GraphProvenanceSource;
  intent: GraphProvenanceIntent;
  /** Generator name/version and input fingerprint are optional for author facts. */
  generator?: string;
  algorithmVersion?: string;
  inputFingerprint?: string;
  /** A replayable author operation label, when the caller has one. */
  operation?: string;
  /** Revision at which the fact was recorded, when known. */
  revision?: number;
}

export interface GraphProvenance extends GraphProvenanceFact {
  /**
   * Chronological prior facts.  The current source/intent fields are the most
   * recent fact; history is never sorted as a graph collection.
   */
  history?: readonly GraphProvenanceFact[];
}

/** Input to appendGraphProvenance; chronology is owned by the current record. */
export type GraphProvenanceFactInput = Omit<GraphProvenance, "history">;

type HistoryFreeAppendInput<T extends GraphProvenanceFactInput> =
  "history" extends keyof T ? never : T;

/** Metadata shared by every typed node and typed edge record. */
export interface GraphRecordMetadata {
  id: string;
  revision: number;
  /** Optional for legacy typed records; graph snapshots require it. */
  parentRevision?: number | null;
  lifecycle: GraphLifecycle;
  provenance: GraphProvenance;
}

/**
 * Endpoint facts only.  This is not a semantic edge type: callers must define
 * whether an endpoint pair is a SurfaceRelation, InteriorStrut, or another
 * domain relation.
 */
export interface GraphEndpointRecord extends GraphRecordMetadata {
  from: string;
  to: string;
}

export interface GraphValidationSuccess<T> {
  ok: true;
  value: T;
  errors: [];
}

export interface GraphValidationFailure {
  ok: false;
  errors: string[];
}

export type GraphValidationResult<T> = GraphValidationSuccess<T> | GraphValidationFailure;

export class GraphValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super("Graph validation failed: " + errors.join("; "));
    this.name = "GraphValidationError";
    this.errors = [...errors];
  }
}

export function isGraphLifecycle(value: unknown): value is GraphLifecycle {
  return value === "candidate" || value === "confirmed" || value === "rejected" || value === "stale";
}

export function isGraphProvenanceIntent(value: unknown): value is GraphProvenanceIntent {
  return value === "generated" || value === "pinned" || value === "manuallyMoved" ||
    value === "manuallyAdded" || value === "manuallyDeleted";
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface GraphPropertyState {
  present: boolean;
  safe: boolean;
  value: unknown;
}

/**
 * Persistence reads must not observe inherited or accessor-only values.  A
 * JSON object literal has own enumerable data properties and therefore passes
 * this check without any special construction.
 */
function propertyState(value: unknown, key: string | number): GraphPropertyState {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return { present: false, safe: false, value: undefined };
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor !== undefined) {
    const isData = Object.prototype.hasOwnProperty.call(descriptor, "value");
    return {
      present: true,
      safe: descriptor.enumerable === true && isData,
      value: isData ? descriptor.value : undefined,
    };
  }
  if (key in value) return { present: true, safe: false, value: undefined };
  return { present: false, safe: false, value: undefined };
}

function hasOwnEnumerableDataProperty(value: unknown, key: string | number): boolean {
  const state = propertyState(value, key);
  return state.present && state.safe;
}

function requireOwnEnumerableDataProperty(
  value: unknown,
  key: string | number,
  path: string,
  errors: string[],
): GraphPropertyState {
  const state = propertyState(value, key);
  if (!state.safe) {
    errors.push(path + "." + String(key) + " must be an own property; it must be an own enumerable data property");
  }
  return state;
}

function requireOptionalOwnEnumerableDataProperty(
  value: unknown,
  key: string | number,
  path: string,
  errors: string[],
): GraphPropertyState {
  const state = propertyState(value, key);
  if (state.present && !state.safe) {
    errors.push(path + "." + String(key) + " must be an own property; it must be an own enumerable data property when present");
  } else if (state.present && state.value === undefined) {
    errors.push(path + "." + String(key) + " must not be undefined when present");
  }
  return state;
}

function validateArrayEntries(
  value: readonly unknown[],
  path: string,
  errors: string[],
): void {
  for (let index = 0; index < value.length; index += 1) {
    if (!hasOwnEnumerableDataProperty(value, index)) {
      errors.push(path + "[" + index + "] must be an own enumerable data property");
    }
  }
}

function createSafeRecord(): Record<string, unknown> {
  return {};
}

function defineOwn(record: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function validateProvenanceFact(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [path + " must be an object"];

  const source = requireOwnEnumerableDataProperty(value, "source", path, errors).value;
  const intent = requireOwnEnumerableDataProperty(value, "intent", path, errors).value;
  const validSource = source === "generated" || source === "author";
  const validIntent = isGraphProvenanceIntent(intent);
  if (!validSource) {
    errors.push(path + ".source is invalid");
  }
  if (!validIntent) {
    errors.push(path + ".intent is invalid");
  }
  for (const field of ["generator", "algorithmVersion", "inputFingerprint", "operation"] as const) {
    const fieldState = requireOptionalOwnEnumerableDataProperty(value, field, path, errors);
    const fieldValue = fieldState.value;
    if (fieldValue !== undefined && typeof fieldValue !== "string") {
      errors.push(path + "." + field + " must be a string when present");
    }
  }
  const revisionState = requireOptionalOwnEnumerableDataProperty(value, "revision", path, errors);
  if (revisionState.value !== undefined && !isSafeNonNegativeInteger(revisionState.value)) {
    errors.push(path + ".revision must be a finite non-negative integer and a safe integer when present");
  }

  if (validSource && validIntent) {
    if (source === "generated" && intent !== "generated") {
      errors.push(path + " generated source must use generated intent");
    } else if (source === "author" && intent === "generated") {
      errors.push(path + " author source must not claim generated intent");
    } else if (source === "generated" && intent === "generated") {
      for (const field of ["generator", "algorithmVersion", "inputFingerprint"] as const) {
        const fieldState = propertyState(value, field);
        if (!fieldState.safe || typeof fieldState.value !== "string" || fieldState.value.length === 0) {
          errors.push(path + "." + field + " must be a non-empty string for generated provenance");
        }
      }
    }
  }
  return errors;
}

export function validateGraphProvenance(value: unknown, path = "provenance"): string[] {
  const errors = validateProvenanceFact(value, path);
  if (!isRecord(value)) return errors;

  const historyState = requireOptionalOwnEnumerableDataProperty(value, "history", path, errors);
  if (historyState.value !== undefined) {
    if (!Array.isArray(historyState.value)) {
      errors.push(path + ".history must be an array when present");
    } else {
      const history = historyState.value;
      validateArrayEntries(history, path + ".history", errors);
      history.forEach((fact, index) => {
        errors.push(...validateProvenanceFact(fact, path + ".history[" + index + "]"));
        if (isRecord(fact) && propertyState(fact, "history").present) {
          errors.push(path + ".history[" + index + "] cannot contain nested history");
        }
      });
    }
  }
  if (historyState.safe && Array.isArray(historyState.value)) {
    let previousRevision: number | undefined;
    for (let index = 0; index < historyState.value.length; index += 1) {
      const factState = propertyState(historyState.value, index);
      if (!factState.safe || !isRecord(factState.value)) continue;
      const revisionState = propertyState(factState.value, "revision");
      if (!revisionState.safe || !isSafeNonNegativeInteger(revisionState.value)) continue;
      if (previousRevision !== undefined && revisionState.value <= previousRevision) {
        errors.push(
          path + ".history[" + index + "].revision must be strictly greater than the previous history revision",
        );
      }
      previousRevision = revisionState.value;
    }
    const currentRevisionState = propertyState(value, "revision");
    if (currentRevisionState.safe && isSafeNonNegativeInteger(currentRevisionState.value) &&
      previousRevision !== undefined && currentRevisionState.value <= previousRevision) {
      errors.push(path + ".revision must be strictly greater than the final history revision");
    }
  }
  return errors;
}

function provenanceFact(value: GraphProvenance): GraphProvenanceFact {
  const fact = createSafeRecord();
  for (const key of Object.keys(value)) {
    if (key !== "history") defineOwn(fact, key, cloneGraphValue(value[key as keyof GraphProvenance]));
  }
  return fact as unknown as GraphProvenanceFact;
}

/** Return all provenance facts in chronological order, including the current fact. */
export function graphProvenanceFacts(value: GraphProvenance): GraphProvenanceFact[] {
  return [
    ...(value.history ? cloneGraphValue(value.history) : []),
    provenanceFact(value),
  ];
}

function latestKnownProvenanceRevision(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  let latest: number | undefined;
  const historyState = propertyState(value, "history");
  if (historyState.safe && Array.isArray(historyState.value)) {
    for (let index = 0; index < historyState.value.length; index += 1) {
      const factState = propertyState(historyState.value, index);
      if (!factState.safe || !isRecord(factState.value)) continue;
      const revisionState = propertyState(factState.value, "revision");
      if (revisionState.safe && isSafeNonNegativeInteger(revisionState.value)) {
        latest = revisionState.value;
      }
    }
  }
  const currentRevisionState = propertyState(value, "revision");
  if (currentRevisionState.safe && isSafeNonNegativeInteger(currentRevisionState.value)) {
    latest = currentRevisionState.value;
  }
  return latest;
}

/**
 * Append a provenance fact without mutating the existing record.  The prior
 * current fact is promoted into the ordered history before the new fact.
 */
export function appendGraphProvenance<T extends GraphProvenanceFactInput>(
  current: GraphProvenance,
  next: T & HistoryFreeAppendInput<T>,
): GraphProvenance {
  const errors = validateGraphProvenance(current, "current provenance")
    .concat(validateGraphProvenance(next, "next provenance"));
  if (propertyState(next, "history").present) {
    errors.push("next provenance fact input must not contain history");
  }
  const latestCurrentRevision = latestKnownProvenanceRevision(current);
  const nextRevisionState = propertyState(next, "revision");
  if (latestCurrentRevision !== undefined && nextRevisionState.safe &&
    isSafeNonNegativeInteger(nextRevisionState.value) && nextRevisionState.value <= latestCurrentRevision) {
    errors.push("next provenance.revision must be strictly greater than the current provenance revision");
  }
  if (errors.length > 0) throw new GraphValidationError(errors);
  const result = createSafeRecord();
  const clonedNext = cloneGraphValue(next);
  for (const key of Object.keys(clonedNext)) defineOwn(result, key, clonedNext[key as keyof GraphProvenanceFact]);
  defineOwn(result, "history", [...graphProvenanceFacts(current)]);
  return result as unknown as GraphProvenance;
}

export const recordGraphProvenance = appendGraphProvenance;

/**
 * Validate only shared metadata; semantic records add their own checks.
 */
export interface GraphMetadataValidationOptions {
  /** Graph snapshots require this field; legacy typed records may omit it. */
  requireParentRevision?: boolean;
}

export function validateGraphMetadata(
  value: unknown,
  path = "record",
  options: GraphMetadataValidationOptions = {},
): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [path + " must be an object"];

  const idState = requireOwnEnumerableDataProperty(value, "id", path, errors);
  const revisionState = requireOwnEnumerableDataProperty(value, "revision", path, errors);
  const parentRevisionState = options.requireParentRevision
    ? requireOwnEnumerableDataProperty(value, "parentRevision", path, errors)
    : requireOptionalOwnEnumerableDataProperty(value, "parentRevision", path, errors);
  const lifecycleState = requireOwnEnumerableDataProperty(value, "lifecycle", path, errors);
  const provenanceState = requireOwnEnumerableDataProperty(value, "provenance", path, errors);

  if (typeof idState.value !== "string" || idState.value.length === 0) {
    errors.push(path + ".id must be a non-empty string");
  }
  if (!isSafeNonNegativeInteger(revisionState.value)) {
    errors.push(path + ".revision must be a finite non-negative integer and a safe integer");
  }
  if (options.requireParentRevision && parentRevisionState.value === undefined) {
    errors.push(path + ".parentRevision must be null or a finite non-negative integer");
  }
  if (parentRevisionState.value !== undefined && parentRevisionState.value !== null &&
    !isSafeNonNegativeInteger(parentRevisionState.value)) {
    errors.push(path + ".parentRevision must be null or a finite non-negative integer and a safe integer when present");
  }
  if (parentRevisionState.value !== null && parentRevisionState.value !== undefined &&
    isSafeNonNegativeInteger(parentRevisionState.value) && isSafeNonNegativeInteger(revisionState.value) &&
    parentRevisionState.value >= revisionState.value) {
    errors.push(path + ".parentRevision must be less than revision");
  }
  if (!isGraphLifecycle(lifecycleState.value)) errors.push(path + ".lifecycle is invalid");
  errors.push(...validateGraphProvenance(provenanceState.value, path + ".provenance"));
  return errors;
}

export function validateGraphEndpointRecord(value: unknown, path = "edge"): string[] {
  const errors = validateGraphMetadata(value, path);
  if (!isRecord(value)) return errors;
  const fromState = requireOwnEnumerableDataProperty(value, "from", path, errors);
  const toState = requireOwnEnumerableDataProperty(value, "to", path, errors);
  if (typeof fromState.value !== "string" || fromState.value.length === 0) {
    errors.push(path + ".from must be a non-empty string");
  }
  if (typeof toState.value !== "string" || toState.value.length === 0) {
    errors.push(path + ".to must be a non-empty string");
  }
  return errors;
}

/**
 * Collect non-finite numeric values without turning optional absent fields
 * into errors.  JSON cannot carry NaN/Infinity, so this also protects runtime
 * callers that validate before serialization.
 */
export function validateFiniteNumbers(value: unknown, path = "value"): string[] {
  const errors: string[] = [];
  const active = new Set<object>();

  const visit = (current: unknown, currentPath: string): void => {
    if (typeof current === "number") {
      if (!Number.isFinite(current)) errors.push(currentPath + " must be finite");
      return;
    }
    if (current === null || typeof current !== "object") return;
    if (active.has(current)) {
      errors.push(currentPath + " contains a cycle");
      return;
    }
    active.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, currentPath + "[" + index + "]"));
    } else {
      for (const key of Object.keys(current)) {
        visit((current as Record<string, unknown>)[key], currentPath + "." + key);
      }
    }
    active.delete(current);
  };

  visit(value, path);
  return errors;
}

/**
 * Clone graph facts without JSON round-tripping.  This keeps optional
 * undefined properties and gives every pure transition independent containers.
 */
export function cloneGraphValue<T>(value: T): T {
  if (Array.isArray(value)) {
    const cloned = value.map((item) => cloneGraphValue(item));
    if (isGraphEntityCollection(value)) return asGraphEntityCollection(cloned as Array<{ id: string }>) as T;
    if (isOrderedActionCollection(value)) return asOrderedActionCollection(cloned) as T;
    return cloned as T;
  }
  if (value !== null && typeof value === "object") {
    const result = createSafeRecord();
    for (const key of Object.keys(value as Record<string, unknown>)) {
      defineOwn(result, key, cloneGraphValue((value as Record<string, unknown>)[key]));
    }
    return result as T;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Canonical arrays
// ---------------------------------------------------------------------------

/**
 * These non-enumerable markers make collection semantics explicit when a
 * caller canonicalizes a value directly.  The marker never appears in JSON.
 */
export const GRAPH_ENTITY_COLLECTION_MARKER = Symbol("katachi.graph.entity-collection");
export const ORDERED_ACTION_COLLECTION_MARKER = Symbol("katachi.graph.ordered-action-collection");

export type GraphEntityCollection<T extends { id: string }> =
  readonly T[] & { readonly [GRAPH_ENTITY_COLLECTION_MARKER]: true };

export type OrderedActionCollection<T> =
  readonly T[] & { readonly [ORDERED_ACTION_COLLECTION_MARKER]: true };

export function asGraphEntityCollection<T extends { id: string }>(
  items: readonly T[],
): GraphEntityCollection<T> {
  const clone = [...items] as T[] & { [GRAPH_ENTITY_COLLECTION_MARKER]?: true };
  Object.defineProperty(clone, GRAPH_ENTITY_COLLECTION_MARKER, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  return clone as GraphEntityCollection<T>;
}

export function asOrderedActionCollection<T>(
  items: readonly T[],
): OrderedActionCollection<T> {
  const clone = [...items] as T[] & { [ORDERED_ACTION_COLLECTION_MARKER]?: true };
  Object.defineProperty(clone, ORDERED_ACTION_COLLECTION_MARKER, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  return clone as OrderedActionCollection<T>;
}

export const graphEntityCollection = asGraphEntityCollection;
export const orderedActionCollection = asOrderedActionCollection;

function isGraphEntityCollection(value: unknown): value is GraphEntityCollection<{ id: string }> {
  return Array.isArray(value) &&
    (value as unknown as { [GRAPH_ENTITY_COLLECTION_MARKER]?: true })[GRAPH_ENTITY_COLLECTION_MARKER] === true;
}

function isOrderedActionCollection(value: unknown): value is OrderedActionCollection<unknown> {
  return Array.isArray(value) &&
    (value as unknown as { [ORDERED_ACTION_COLLECTION_MARKER]?: true })[ORDERED_ACTION_COLLECTION_MARKER] === true;
}

function isOrderedActionPath(path: string): boolean {
  return path.split(".").some((segment) =>
    segment === "actions" || /^actions\[(?:\d+|\*)?\]$/.test(segment),
  );
}

/** Persisted collection paths use dot-separated object keys only.  Arrays may
 * be the terminal value, but an index/wildcard/bracket segment is ambiguous
 * because canonical traversal deliberately does not address array elements by
 * numeric path.
 */
function isSafeCollectionPath(path: string): boolean {
  return path.length > 0 && path.split(".").every((segment) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment));
}

function collectionPathSyntaxError(index: number, path: string): string {
  return "collectionPaths[" + index + "] must use dot-separated safe object-key segments: " + path;
}

/**
 * Provenance history is chronological evidence, never an unordered entity
 * collection.  Match the path by segments so the rule also covers nested
 * entity collections and descendants of a history array (for example
 * `surface.provenance.history.entries`) without reserving unrelated paths.
 */
function isProvenanceHistoryPath(path: string): boolean {
  const segments = path.split(".");
  return segments.some((segment, index) => segment === "provenance" && segments[index + 1] === "history");
}

/**
 * Dot paths describe array/object locations.  A caller-supplied ordered path
 * may target the same collection or a nested/containing location, so all
 * prefix relationships are treated as a semantic conflict with a persisted
 * unordered collection declaration.
 */
function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(right + ".") || right.startsWith(left + ".");
}

/**
 * Validate the complete value graph that is about to cross the persistence
 * boundary.  JSON.stringify is intentionally not used for this check: it
 * drops undefined/function/symbol values, converts non-finite numbers, and
 * ignores non-enumerable or inherited properties.  Every accepted value must
 * therefore be made solely from JSON primitives, arrays, and plain objects
 * whose own enumerable properties are data properties.
 */
function validateStrictJsonPersistability(value: unknown, path = "value"): string[] {
  const errors: string[] = [];
  const active = new Set<object>();
  const visit = (current: unknown, currentPath: string): void => {
    if (current === null || typeof current === "string" || typeof current === "boolean") return;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) errors.push(currentPath + " must be finite");
      return;
    }
    if (current === undefined) {
      errors.push(currentPath + " must not be undefined");
      return;
    }
    if (typeof current === "function" || typeof current === "symbol" || typeof current === "bigint") {
      errors.push(currentPath + " must be a JSON primitive, object, or array");
      return;
    }
    if (typeof current !== "object") {
      errors.push(currentPath + " must be a JSON primitive, object, or array");
      return;
    }
    if (active.has(current)) {
      errors.push(currentPath + " contains a cycle");
      return;
    }

    const isArray = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    const expectedPrototype = isArray ? Array.prototype : Object.prototype;
    if (prototype !== null && prototype !== expectedPrototype) {
      errors.push(currentPath + " must be a plain JSON " + (isArray ? "array" : "object"));
    }

    active.add(current);
    const ownNames = Object.getOwnPropertyNames(current);
    for (const key of ownNames) {
      if (isArray && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        errors.push(currentPath + "." + key + " must be an own enumerable data property");
      }
    }
    for (const symbol of Object.getOwnPropertySymbols(current)) {
      const markerDescriptor = Object.getOwnPropertyDescriptor(current, symbol);
      const isKnownMarker = isArray &&
        (symbol === GRAPH_ENTITY_COLLECTION_MARKER || symbol === ORDERED_ACTION_COLLECTION_MARKER) &&
        markerDescriptor !== undefined &&
        markerDescriptor.enumerable === false &&
        Object.prototype.hasOwnProperty.call(markerDescriptor, "value") &&
        markerDescriptor.value === true;
      if (!isKnownMarker) errors.push(currentPath + " contains an unsupported symbol property");
    }
    for (const key in current) {
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        errors.push(currentPath + "." + key + " must not be inherited");
      }
    }

    if (isArray) {
      const array = current as unknown[];
      for (let index = 0; index < array.length; index += 1) {
        const itemPath = currentPath + "[" + index + "]";
        const state = propertyState(array, index);
        if (!state.safe) {
          errors.push(itemPath + " must be an own enumerable data property");
          continue;
        }
        visit(state.value, itemPath);
      }
      for (const key of Object.keys(array)) {
        const index = Number(key);
        const isIndex = Number.isInteger(index) && index >= 0 && index < 4294967295 &&
          String(index) === key && index < array.length;
        if (!isIndex) errors.push(currentPath + "." + key + " is not a persistable array index");
      }
    } else {
      const object = current as Record<string, unknown>;
      for (const key of Object.keys(object)) {
        const state = propertyState(object, key);
        const childPath = currentPath + "." + key;
        if (!state.safe) {
          errors.push(childPath + " must be an own enumerable data property");
          continue;
        }
        visit(state.value, childPath);
      }
    }
    active.delete(current);
  };

  visit(value, path);
  return errors;
}

function assertStrictJsonPersistable(value: unknown): void {
  const errors = validateStrictJsonPersistability(value);
  if (errors.length > 0) throw new GraphValidationError(errors);
}

export const DEFAULT_GRAPH_ENTITY_COLLECTION_PATHS = ["nodes", "edges"] as const;

export interface CanonicalSerializationOptions {
  /**
   * Paths with graph entities whose order is presentation-independent.  Paths
   * use dot notation, for example surface.nodes.  Only these paths may sort.
   */
  entityCollectionPaths?: readonly string[];
  /** Alias for entityCollectionPaths for callers using the graph vocabulary. */
  graphEntityCollectionPaths?: readonly string[];
  /** Explicitly ordered paths always win over entity collection paths. */
  orderedArrayPaths?: readonly string[];
  /** Set false for a fully ordered generic serialization. */
  sortGraphEntityCollections?: boolean;
}

function canonicalOptions(options: CanonicalSerializationOptions = {}): {
  entityPaths: readonly string[];
  orderedPaths: readonly string[];
  sortEntities: boolean;
  persistedEntityPaths: readonly string[];
} {
  const configuredPaths = options.entityCollectionPaths ?? options.graphEntityCollectionPaths;
  const requestedEntityPaths = configuredPaths ?? DEFAULT_GRAPH_ENTITY_COLLECTION_PATHS;
  const invalidPath = requestedEntityPaths.find((path) =>
    typeof path !== "string" || !isSafeCollectionPath(path),
  );
  if (invalidPath !== undefined) {
    throw new GraphValidationError([
      "canonical entity collection path must use dot-separated safe object-key segments: " + invalidPath,
    ]);
  }
  const conflictingPath = requestedEntityPaths.find((path) => isOrderedActionPath(path));
  if (conflictingPath !== undefined) {
    throw new GraphValidationError([
      "canonical entity collection path conflicts with ordered actions: " + conflictingPath,
    ]);
  }
  const conflictingHistoryPath = requestedEntityPaths.find((path) => isProvenanceHistoryPath(path));
  if (conflictingHistoryPath !== undefined) {
    throw new GraphValidationError([
      "canonical entity collection path conflicts with provenance history: " + conflictingHistoryPath,
    ]);
  }
  return {
    entityPaths: requestedEntityPaths,
    orderedPaths: options.orderedArrayPaths ?? [],
    sortEntities: options.sortGraphEntityCollections !== false,
    persistedEntityPaths: [],
  };
}

interface PersistedCollectionPathValidation {
  paths: string[];
  errors: string[];
}

/**
 * Validate the persisted declaration and each declared terminal collection.
 * This is shared by document validation and every canonical API so a path
 * cannot be accepted for bytes/hash while being rejected by document parsing.
 * Canonical values need only the common ID-bearing entity contract here;
 * document validation adds its stricter metadata checks in the normal entity
 * loop below.
 */
function validatePersistedCollectionPaths(
  value: unknown,
  context: string,
): PersistedCollectionPathValidation {
  const state = propertyState(value, "collectionPaths");
  if (!state.present) return { paths: [], errors: [] };
  if (!state.safe) {
    return {
      paths: [],
      errors: [context + " collectionPaths must be an own enumerable data property"],
    };
  }
  if (!Array.isArray(state.value)) {
    return {
      paths: [],
      errors: [context + " collectionPaths must be an array when present"],
    };
  }

  const errors: string[] = [];
  const paths: string[] = [];
  const declaredPathSet = new Set<string>();
  const seenIds = new Map<string, string>();
  const collectionPaths = state.value;
  validateArrayEntries(collectionPaths, context + " collectionPaths", errors);

  for (let index = 0; index < collectionPaths.length; index += 1) {
    const entryState = propertyState(collectionPaths, index);
    const entry = entryState.value;
    if (!entryState.safe || typeof entry !== "string" || entry.length === 0) {
      errors.push(context + " collectionPaths[" + index + "] must be a non-empty string");
      continue;
    }
    if (!isSafeCollectionPath(entry)) {
      errors.push(context + " " + collectionPathSyntaxError(index, entry));
      continue;
    }
    paths.push(entry);
    if (declaredPathSet.has(entry)) {
      errors.push(context + " collectionPaths must not contain duplicates: " + entry);
    }
    declaredPathSet.add(entry);
    if (isOrderedActionPath(entry)) {
      errors.push(context + " collectionPaths path conflicts with ordered actions: " + entry);
    }
    if (isProvenanceHistoryPath(entry)) {
      errors.push(context + " collectionPaths path conflicts with provenance history: " + entry);
    }

    const declaredState = pathState(value, entry);
    if (!declaredState.present) {
      errors.push(context + " " + entry + " must exist for declared collectionPaths");
      continue;
    }
    if (!declaredState.safe) {
      errors.push(context + " " + entry + " must be an own enumerable data property");
      continue;
    }
    if (!Array.isArray(declaredState.value)) {
      errors.push(context + " " + entry + " must be an array for declared collectionPaths");
      continue;
    }
    const collection = declaredState.value;
    if (isOrderedActionCollection(collection)) {
      errors.push(
        context + " " + entry +
          " ordered action collection marker conflicts with persisted entity collection path",
      );
    }
    if (isOrderedActionPath(entry) || isProvenanceHistoryPath(entry)) continue;
    validateArrayEntries(collection, context + " " + entry, errors);
    for (let entityIndex = 0; entityIndex < collection.length; entityIndex += 1) {
      if (!hasOwnEnumerableDataProperty(collection, entityIndex)) continue;
      const entityPath = context + " " + entry + "[" + entityIndex + "]";
      const entity = propertyState(collection, entityIndex).value;
      if (!isRecord(entity)) {
        errors.push(entityPath + " must be an object");
        continue;
      }
      const id = stableRecordId(entity);
      if (id === undefined) {
        errors.push(entityPath + ".id must be a non-empty string");
        continue;
      }
      const previous = seenIds.get(id);
      if (previous) errors.push(entityPath + ".id duplicates " + id + " (already in " + previous + ")");
      else seenIds.set(id, entityPath);
    }
  }
  return { paths, errors };
}

function canonicalOptionsForValue(
  value: unknown,
  options: CanonicalSerializationOptions = {},
): ReturnType<typeof canonicalOptions> {
  const base = canonicalOptions(options);
  const persistedValidation = validatePersistedCollectionPaths(value, "canonical graph");
  if (persistedValidation.errors.length > 0) throw new GraphValidationError(persistedValidation.errors);
  const persisted = persistedValidation.paths;
  const orderedPaths = options.orderedArrayPaths ?? [];
  for (const persistedPath of persisted) {
    const orderedPath = orderedPaths.find((candidate) =>
      typeof candidate === "string" && pathsOverlap(persistedPath, candidate),
    );
    if (orderedPath !== undefined) {
      throw new GraphValidationError([
        "persisted entity collection path conflicts with ordered array path: " +
          persistedPath + " vs " + orderedPath,
      ]);
    }
  }
  if (persisted.length === 0) return base;
  const persistedEntityPaths = persisted.filter((path) => !isOrderedActionPath(path));
  return {
    ...base,
    entityPaths: [...new Set([...base.entityPaths, ...persistedEntityPaths])],
    persistedEntityPaths,
  };
}

function hasPath(paths: readonly string[], path: string): boolean {
  return paths.some((candidate) => candidate === path);
}

function entityId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const idState = propertyState(value, "id");
  if (!idState.safe) return undefined;
  if (typeof idState.value === "string" && idState.value.length > 0) return "s:" + idState.value;
  if (typeof idState.value === "number" && Number.isFinite(idState.value)) return "n:" + String(idState.value);
  return undefined;
}

function canonicalizeValue(
  value: unknown,
  active: Set<object>,
  options: ReturnType<typeof canonicalOptions>,
  path: string,
): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new GraphValidationError(["canonical serialization requires finite numbers"]);
    return Object.is(value, -0) ? 0 : value;
  }
  if (value === undefined) return undefined;
  if (typeof value !== "object") {
    throw new GraphValidationError(["canonical serialization only supports JSON values"]);
  }
  if (active.has(value)) throw new GraphValidationError(["canonical serialization cannot encode cycles"]);

  active.add(value);
  let result: unknown;
  if (Array.isArray(value)) {
    if (isOrderedActionCollection(value) && hasPath(options.persistedEntityPaths, path)) {
      throw new GraphValidationError([
        "ordered action collection marker conflicts with persisted entity collection path: " + path,
      ]);
    }
    let items = value.map((item) => {
      const normalized = canonicalizeValue(item, active, options, path + "[]");
      return normalized === undefined ? null : normalized;
    });
    if (path === "collectionPaths") {
      const declarationPaths = items.filter((item): item is string => typeof item === "string");
      if (declarationPaths.length === items.length) {
        items = [...declarationPaths].sort();
      }
    }

    const explicitlyOrdered = isOrderedActionCollection(value) ||
      isOrderedActionPath(path) || hasPath(options.orderedPaths, path);
    const explicitlyGraphEntities = isGraphEntityCollection(value) ||
      hasPath(options.persistedEntityPaths, path) ||
      (options.sortEntities && hasPath(options.entityPaths, path));
    if (explicitlyGraphEntities && !explicitlyOrdered) {
      const sortable = items.every((item) => entityId(item) !== undefined);
      if (sortable) {
        const keys = items.map((item) => JSON.stringify(item));
        const indexed = items.map((item, index) => ({
          item,
          id: entityId(item) as string,
          tie: keys[index] as string,
        }));
        indexed.sort((left, right) => {
          if (left.id < right.id) return -1;
          if (left.id > right.id) return 1;
          if (left.tie < right.tie) return -1;
          if (left.tie > right.tie) return 1;
          return 0;
        });
        result = indexed.map((entry) => entry.item);
      } else {
        // A collection without stable IDs is not silently reordered.
        result = items;
      }
    } else {
      // Ordered action arrays intentionally preserve author chronology even
      // when their action objects happen to carry an id field.
      result = items;
    }
  } else {
    const objectResult = createSafeRecord();
    for (const key of Object.keys(value).sort()) {
      const childPath = path.length > 0 ? path + "." + key : key;
      const normalized = canonicalizeValue(
        (value as Record<string, unknown>)[key],
        active,
        options,
        childPath,
      );
      // JSON object properties with undefined are omitted.
      if (normalized !== undefined) defineOwn(objectResult, key, normalized);
    }
    result = objectResult;
  }
  active.delete(value);
  return result;
}

/** Canonical value with explicit graph-collection paths and ordered arrays. */
export function canonicalize<T>(value: T, options?: CanonicalSerializationOptions): T {
  assertStrictJsonPersistable(value);
  return canonicalizeValue(value, new Set<object>(), canonicalOptionsForValue(value, options), "") as T;
}

/**
 * Deterministic JSON.  Object keys are sorted; only the schema-defined
 * nodes/edges paths (or explicitly marked collections) may be reordered.
 */
export function canonicalStringify(
  value: unknown,
  options?: CanonicalSerializationOptions,
): string {
  const serialized = JSON.stringify(canonicalize(value, options));
  if (typeof serialized !== "string") {
    throw new GraphValidationError(["canonical serialization did not produce JSON bytes"]);
  }
  return serialized;
}

export const canonicalGraphStringify = canonicalStringify;
export const serializeCanonical = canonicalStringify;

export function serializeGraph<T>(
  graph: T,
  options?: CanonicalSerializationOptions,
): string {
  return canonicalStringify(graph, options);
}

export function parseGraphJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new GraphValidationError(["invalid graph JSON: " + message]);
  }
}

export function assertGraphValid<T>(value: T, errors: readonly string[]): T {
  if (errors.length > 0) throw new GraphValidationError(errors);
  return value;
}

export function assertValidGraph<T>(result: GraphValidationResult<T>): T {
  if (!result.ok) throw new GraphValidationError(result.errors);
  return result.value;
}

// ---------------------------------------------------------------------------
// Revision and lineage
// ---------------------------------------------------------------------------

export interface GraphRevisionLineage {
  revision: number;
  parentRevision: number | null;
  lineage: readonly number[];
}

export interface GraphRevision<T> extends GraphRevisionLineage {
  value: T;
}

export interface GraphRevisionOptions {
  revision?: number;
}

export function validateRevisionLineage(value: unknown, path = "revision"): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [path + " must be an object"];

  const revisionState = requireOwnEnumerableDataProperty(value, "revision", path, errors);
  const parentRevisionState = requireOwnEnumerableDataProperty(value, "parentRevision", path, errors);
  const lineageState = requireOwnEnumerableDataProperty(value, "lineage", path, errors);
  const revision = revisionState.value;
  const parentRevision = parentRevisionState.value;
  if (!isSafeNonNegativeInteger(revision)) {
    errors.push(path + ".revision must be a finite non-negative integer and a safe integer");
  }
  if (parentRevision !== null &&
    !isSafeNonNegativeInteger(parentRevision)) {
    errors.push(path + ".parentRevision must be null or a finite non-negative integer and a safe integer");
  }
  if (isSafeNonNegativeInteger(revision) && parentRevision !== null &&
    isSafeNonNegativeInteger(parentRevision) && parentRevision >= revision) {
    errors.push(path + ".parentRevision must be less than revision");
  }
  if (revision === 0 && parentRevision !== null) {
    errors.push(path + ".revision zero must have a null parentRevision");
  }

  const lineage = lineageState.value;
  if (!Array.isArray(lineage)) {
    errors.push(path + ".lineage must be an array");
  } else {
    if (lineage.length === 0) errors.push(path + ".lineage must not be empty");
    validateArrayEntries(lineage, path + ".lineage", errors);
    for (let index = 0; index < lineage.length; index += 1) {
      const entryState = propertyState(lineage, index);
      const entry = entryState.value;
      if (!entryState.safe || !isSafeNonNegativeInteger(entry)) {
        errors.push(path + ".lineage[" + index + "] must be a finite non-negative integer and a safe integer");
      }
      const previous = index > 0 ? propertyState(lineage, index - 1).value : undefined;
      if (index > 0 && isSafeNonNegativeInteger(entry) && isSafeNonNegativeInteger(previous) &&
        entry <= previous) {
        errors.push(path + ".lineage must be strictly increasing");
      }
    }
    const last = propertyState(lineage, lineage.length - 1).value;
    if (isSafeNonNegativeInteger(revision) && last !== revision) {
      errors.push(path + ".lineage must end at revision");
    }
    if (lineage.length === 1 && parentRevision !== null) {
      errors.push(path + ".parentRevision must be null for a root lineage");
    }
    if (lineage.length > 1 && parentRevision === null) {
      errors.push(path + ".parentRevision must be non-null for a non-root lineage");
    }
    if (lineage.length > 1 && parentRevision !== null &&
      propertyState(lineage, lineage.length - 2).value !== parentRevision) {
      errors.push(path + ".lineage penultimate entry must equal parentRevision");
    }
  }
  return errors;
}

export function createGraphRevision<T>(
  value: T,
  options: GraphRevisionOptions = {},
): GraphRevision<T> {
  const revisionState = propertyState(options, "revision");
  const requestedRevision = revisionState.present ? revisionState.value : 0;
  if (revisionState.present && !revisionState.safe) {
    throw new GraphValidationError([
      "initial revision.revision must be an own property; it must be an own enumerable data property when present",
    ]);
  }
  const candidate = { revision: requestedRevision, parentRevision: null, lineage: [requestedRevision] };
  const errors = validateRevisionLineage(candidate, "initial revision");
  if (errors.length > 0) throw new GraphValidationError(errors);
  const revision = requestedRevision as number;
  return {
    revision,
    parentRevision: null,
    lineage: [revision],
    value: cloneGraphValue(value),
  };
}

export function advanceGraphRevision<T>(
  current: GraphRevision<T>,
  nextValue: T,
): GraphRevision<T>;
export function advanceGraphRevision<T>(
  current: GraphRevision<T>,
  updater: (currentValue: T) => T,
): GraphRevision<T>;
export function advanceGraphRevision<T>(
  current: GraphRevision<T>,
  nextOrUpdater: T | ((currentValue: T) => T),
): GraphRevision<T> {
  const errors = validateRevisionLineage(current, "current revision");
  if (errors.length > 0) throw new GraphValidationError(errors);
  if (current.revision >= Number.MAX_SAFE_INTEGER) {
    throw new GraphValidationError(["cannot advance revision beyond Number.MAX_SAFE_INTEGER"]);
  }
  const isolatedCurrent = cloneGraphValue(current.value);
  const next = typeof nextOrUpdater === "function"
    ? (nextOrUpdater as (currentValue: T) => T)(isolatedCurrent)
    : nextOrUpdater;
  const revision = current.revision + 1;
  if (!isSafeNonNegativeInteger(revision)) {
    throw new GraphValidationError(["next revision must be a finite non-negative integer and a safe integer"]);
  }
  return {
    revision,
    parentRevision: current.revision,
    lineage: [...current.lineage, revision],
    value: cloneGraphValue(next),
  };
}

export const transitionGraphRevision = advanceGraphRevision;
export const nextGraphRevision = advanceGraphRevision;

// ---------------------------------------------------------------------------
// Generic graph envelope and validation
// ---------------------------------------------------------------------------

export interface GraphAuthorAction {
  type: string;
  targetId?: string;
  revision?: number;
  payload?: unknown;
}

/**
 * Edge is intentionally unknown here.  A caller supplies endpoint selectors
 * for its own typed edge descriptors; the core never assigns edge semantics.
 */
export interface GraphCoreDocument<Node = GraphRecordMetadata, Edge = unknown, Action = GraphAuthorAction>
  extends GraphRevisionLineage {
  schemaVersion: typeof GRAPH_CORE_SCHEMA_VERSION;
  id: string;
  lifecycle: GraphLifecycle;
  nodes: readonly Node[];
  edges?: readonly Edge[];
  actions?: readonly Action[];
  provenance?: GraphProvenance;
  kind?: string;
  /** Optional persisted names for caller-declared graph entity collections. */
  collectionPaths?: readonly string[];
}

export type GraphDocument<Node = GraphRecordMetadata, Edge = unknown, Action = GraphAuthorAction> =
  GraphCoreDocument<Node, Edge, Action>;

export interface GraphEndpointPair {
  from: string;
  to: string;
}

export type GraphEndpointSelector<T = never> = (
  descriptor: T,
  index: number,
) => GraphEndpointPair | readonly [string, string] | null | undefined;

export interface TypedEdgeDescriptorCollection<T = never> {
  /** Dot path to the caller-owned typed edge descriptor array. */
  collectionPath?: string;
  /** Alias for collectionPath. */
  path?: string;
  endpointSelector?: GraphEndpointSelector<T>;
  getEndpoints?: GraphEndpointSelector<T>;
}

export type GraphFactValidator = (value: unknown, index: number) => readonly string[] | void;

export interface GraphDocumentValidationOptions<TypedEdge = never> {
  /**
   * Entity paths are the only arrays whose IDs participate in duplicate-ID
   * validation.  actions are intentionally absent by default.
   */
  entityCollectionPaths?: readonly string[];
  /**
   * Explicit compatibility escape hatch for legacy records that predate the
   * Graph Core metadata contract.  Strict validation is the default.
   */
  relaxedLegacyMode?: boolean;
  /** Legacy switches are honored only when relaxedLegacyMode is true. */
  requireEntityIds?: boolean;
  requireEntityMetadata?: boolean;
  nodeValidator?: GraphFactValidator;
  entityValidator?: GraphFactValidator;
  /** Explicit typed-edge endpoint rules for caller-owned edge semantics. */
  typedEdgeDescriptors?: readonly TypedEdgeDescriptorCollection<TypedEdge>[];
  edgeCollectionPath?: string;
  edgeEndpointSelector?: GraphEndpointSelector<TypedEdge>;
}

interface GraphPathState {
  present: boolean;
  safe: boolean;
  value: unknown;
}

function pathState(root: unknown, path: string): GraphPathState {
  if (path.length === 0) return { present: true, safe: true, value: root };
  let current: unknown = root;
  for (const part of path.split(".")) {
    const state = propertyState(current, part);
    if (!state.present) return { present: false, safe: false, value: undefined };
    if (!state.safe) return { present: true, safe: false, value: undefined };
    current = state.value;
  }
  return { present: true, safe: true, value: current };
}

function valueAtPath(root: unknown, path: string): unknown {
  const state = pathState(root, path);
  return state.safe ? state.value : undefined;
}

function customValidatorErrors(
  validator: GraphFactValidator | undefined,
  value: unknown,
  index: number,
  path: string,
): string[] {
  if (!validator) return [];
  try {
    const result = validator(value, index);
    if (!result) return [];
    return [...result].map((error) => path + ": " + error);
  } catch (error) {
    const message = error instanceof Error ? error.message : "validator threw";
    return [path + ": " + message];
  }
}

/**
 * Author actions are caller-owned records, but their optional revision fact is
 * still persisted graph state.  Keep that number on the same safe-integer
 * contract as metadata and provenance without imposing a semantic action
 * schema on the core.
 */
function validateGraphActionRevision(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return errors;
  const revisionState = requireOptionalOwnEnumerableDataProperty(value, "revision", path, errors);
  if (revisionState.value !== undefined && !isSafeNonNegativeInteger(revisionState.value)) {
    errors.push(path + ".revision must be a finite non-negative integer and a safe integer when present");
  }
  return errors;
}

function validateDefaultEndpointDescriptor(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return errors;

  const from = propertyState(value, "from");
  const to = propertyState(value, "to");
  if (from.present || to.present) {
    if (from.present && !from.safe) {
      errors.push(path + ".from must be an own property; it must be an own enumerable data property when present");
    }
    if (to.present && !to.safe) {
      errors.push(path + ".to must be an own property; it must be an own enumerable data property when present");
    }
    return errors;
  }

  const nested = propertyState(value, "endpoints");
  if (nested.present && !nested.safe) {
    errors.push(path + ".endpoints must be an own property; it must be an own enumerable data property when present");
  }
  if (nested.safe && isRecord(nested.value)) {
    const nestedFrom = propertyState(nested.value, "from");
    const nestedTo = propertyState(nested.value, "to");
    if (nestedFrom.present && !nestedFrom.safe) {
      errors.push(path + ".endpoints.from must be an own property; it must be an own enumerable data property when present");
    }
    if (nestedTo.present && !nestedTo.safe) {
      errors.push(path + ".endpoints.to must be an own property; it must be an own enumerable data property when present");
    }
  }
  return errors;
}

function defaultEndpointSelector(value: unknown): GraphEndpointPair | undefined {
  if (!isRecord(value)) return undefined;
  const from = propertyState(value, "from");
  const to = propertyState(value, "to");
  if (from.present || to.present) {
    if (!from.safe || !to.safe) return undefined;
    return { from: from.value as string, to: to.value as string };
  }
  const nested = propertyState(value, "endpoints");
  if (!nested.safe || !isRecord(nested.value)) return undefined;
  const nestedFrom = propertyState(nested.value, "from");
  const nestedTo = propertyState(nested.value, "to");
  if (!nestedFrom.present && !nestedTo.present) return undefined;
  if (!nestedFrom.safe || !nestedTo.safe) return undefined;
  return { from: nestedFrom.value as string, to: nestedTo.value as string };
}

interface NormalizedEndpointResult {
  pair?: GraphEndpointPair;
  errors: string[];
}

function normalizeEndpointResult(value: unknown, path: string): NormalizedEndpointResult {
  const errors: string[] = [];
  if (Array.isArray(value)) {
    if (value.length !== 2) return { errors: [path + " must provide a from/to endpoint pair"] };
    validateArrayEntries(value, path, errors);
    const from = propertyState(value, 0).value;
    const to = propertyState(value, 1).value;
    return { pair: { from: from as string, to: to as string }, errors };
  }
  if (isRecord(value)) {
    const from = requireOwnEnumerableDataProperty(value, "from", path, errors).value;
    const to = requireOwnEnumerableDataProperty(value, "to", path, errors).value;
    return { pair: { from: from as string, to: to as string }, errors };
  }
  return { errors: [path + " must provide a from/to endpoint pair"] };
}

function nodeIdSet(nodeIds: ReadonlySet<string> | readonly string[]): Set<string> {
  return nodeIds instanceof Set ? new Set(nodeIds) : new Set(nodeIds);
}

/**
 * Validate endpoint pairs for caller-supplied typed edge descriptors.  The
 * selector extracts only endpoint facts; the core does not interpret the edge.
 */
export function validateTypedEdgeDescriptors<T>(
  descriptors: readonly T[],
  nodeIds: ReadonlySet<string> | readonly string[],
  endpointSelector?: GraphEndpointSelector<T>,
  path?: string,
): string[];
export function validateTypedEdgeDescriptors<T>(
  descriptors: readonly T[],
  nodeIds: ReadonlySet<string> | readonly string[],
  path: string,
): string[];
export function validateTypedEdgeDescriptors<T>(
  descriptors: readonly T[],
  nodeIds: ReadonlySet<string> | readonly string[],
  selectorOrPath?: GraphEndpointSelector<T> | string,
  path = "edges",
): string[] {
  const selector = typeof selectorOrPath === "function"
    ? selectorOrPath
    : (defaultEndpointSelector as GraphEndpointSelector<T>);
  const actualPath = typeof selectorOrPath === "string" ? selectorOrPath : path;
  const ids = nodeIdSet(nodeIds);
  const errors: string[] = [];
  validateArrayEntries(descriptors, actualPath, errors);
  const usesDefaultSelector = typeof selectorOrPath !== "function";
  for (let index = 0; index < descriptors.length; index += 1) {
    if (!hasOwnEnumerableDataProperty(descriptors, index)) continue;
    const descriptor = propertyState(descriptors, index).value as T;
    if (usesDefaultSelector) {
      errors.push(...validateDefaultEndpointDescriptor(descriptor, actualPath + "[" + index + "]"));
    }
    let selected: unknown;
    try {
      selected = selector(descriptor, index);
    } catch (error) {
      const message = error instanceof Error ? error.message : "endpoint selector threw";
      errors.push(actualPath + "[" + index + "] endpoint selector failed: " + message);
      continue;
    }
    const normalized = normalizeEndpointResult(selected, actualPath + "[" + index + "] endpoints");
    errors.push(...normalized.errors);
    const endpoints = normalized.pair;
    if (!endpoints) continue;
    if (typeof endpoints.from !== "string" || endpoints.from.length === 0) {
      errors.push(actualPath + "[" + index + "].from must be a non-empty string");
    } else if (!ids.has(endpoints.from)) {
      errors.push(actualPath + "[" + index + "].from is a dangling endpoint: " + endpoints.from);
    }
    if (typeof endpoints.to !== "string" || endpoints.to.length === 0) {
      errors.push(actualPath + "[" + index + "].to must be a non-empty string");
    } else if (!ids.has(endpoints.to)) {
      errors.push(actualPath + "[" + index + "].to is a dangling endpoint: " + endpoints.to);
    }
  }
  return errors;
}

function hasRecordMetadata(value: unknown): boolean {
  return isRecord(value) && ("revision" in value || "parentRevision" in value ||
    "lifecycle" in value || "provenance" in value);
}

function stableRecordId(value: unknown): string | undefined {
  if (!isRecord(value) || !hasOwnEnumerableDataProperty(value, "id")) return undefined;
  const id = propertyState(value, "id").value;
  if (typeof id !== "string" || id.length === 0) return undefined;
  return id;
}

export function validateGraphDocument<TypedEdge = never>(
  value: unknown,
  options: GraphDocumentValidationOptions<TypedEdge> = {},
): GraphValidationResult<GraphCoreDocument> {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["graph document must be an object"] };

  const schemaVersionState = requireOwnEnumerableDataProperty(value, "schemaVersion", "graph document", errors);
  const idState = requireOwnEnumerableDataProperty(value, "id", "graph document", errors);
  const lifecycleState = requireOwnEnumerableDataProperty(value, "lifecycle", "graph document", errors);
  const nodesState = requireOwnEnumerableDataProperty(value, "nodes", "graph document", errors);
  const edgesState = requireOptionalOwnEnumerableDataProperty(value, "edges", "graph document", errors);
  const actionsState = requireOptionalOwnEnumerableDataProperty(value, "actions", "graph document", errors);
  const provenanceState = requireOptionalOwnEnumerableDataProperty(value, "provenance", "graph document", errors);
  const kindState = requireOptionalOwnEnumerableDataProperty(value, "kind", "graph document", errors);

  if (schemaVersionState.value !== GRAPH_CORE_SCHEMA_VERSION) {
    errors.push("graph document schemaVersion is invalid");
  }
  if (typeof idState.value !== "string" || idState.value.length === 0) {
    errors.push("graph document id must be a non-empty string");
  }
  errors.push(...validateRevisionLineage(value, "graph document"));
  if (!isGraphLifecycle(lifecycleState.value)) errors.push("graph document lifecycle is invalid");
  if (kindState.value !== undefined && (typeof kindState.value !== "string" || kindState.value.length === 0)) {
    errors.push("graph document kind must be a non-empty string when present");
  }
  if (provenanceState.value !== undefined) {
    errors.push(...validateGraphProvenance(provenanceState.value, "graph document.provenance"));
  }
  if (!Array.isArray(nodesState.value)) {
    errors.push("graph document nodes must be an array");
  } else {
    validateArrayEntries(nodesState.value, "graph document nodes", errors);
  }
  if (edgesState.value !== undefined && !Array.isArray(edgesState.value)) {
    errors.push("graph document edges must be an array when present");
  } else if (Array.isArray(edgesState.value)) {
    validateArrayEntries(edgesState.value, "graph document edges", errors);
  }
  if (actionsState.value !== undefined && !Array.isArray(actionsState.value)) {
    errors.push("graph document actions must be an array when present");
  } else if (Array.isArray(actionsState.value)) {
    const actions = actionsState.value;
    validateArrayEntries(actions, "graph document actions", errors);
    for (let index = 0; index < actions.length; index += 1) {
      if (!hasOwnEnumerableDataProperty(actions, index)) continue;
      errors.push(...validateGraphActionRevision(
        propertyState(actions, index).value,
        "graph document actions[" + index + "]",
      ));
    }
  }
  const relaxedLegacyMode = options.relaxedLegacyMode === true;
  const requireEntityIds = !relaxedLegacyMode || options.requireEntityIds === true;
  const requireEntityMetadata = !relaxedLegacyMode || options.requireEntityMetadata === true;
  const configuredEntityPaths = options.entityCollectionPaths ?? [];
  const persistedCollectionValidation = validatePersistedCollectionPaths(value, "graph document");
  errors.push(...persistedCollectionValidation.errors);
  const declaredCollectionPaths = persistedCollectionValidation.paths;
  const declaredEntityPaths = [...new Set(declaredCollectionPaths.filter((path) =>
    !isOrderedActionPath(path) && !isProvenanceHistoryPath(path),
  ))];
  const declaredEntityPathSet = new Set(declaredEntityPaths);
  for (const configuredPath of configuredEntityPaths) {
    if (typeof configuredPath === "string" && isOrderedActionPath(configuredPath)) {
      errors.push(
        "graph validation entity collection path conflicts with ordered actions: " + configuredPath,
      );
    }
  }
  const entityPaths = relaxedLegacyMode
    ? [...new Set([...(options.entityCollectionPaths ?? ["nodes", "edges"]), ...declaredEntityPaths])]
    : [...new Set(["nodes", "edges", ...configuredEntityPaths, ...declaredEntityPaths])];
  const seenIds = new Map<string, string>();
  const nodeIds = new Set<string>();

  for (const collectionPath of entityPaths) {
    const requireIdsForPath = requireEntityIds || declaredEntityPathSet.has(collectionPath);
    const collectionState = pathState(value, collectionPath);
    if (!collectionState.present) continue;
    if (!collectionState.safe) {
      errors.push("graph document " + collectionPath + " must be an own enumerable data property");
      continue;
    }
    const collection = collectionState.value;
    if (!Array.isArray(collection)) {
      errors.push("graph document " + collectionPath + " must be an array");
      continue;
    }
    validateArrayEntries(collection, "graph document " + collectionPath, errors);
    for (let index = 0; index < collection.length; index += 1) {
      if (!hasOwnEnumerableDataProperty(collection, index)) continue;
      const entity = propertyState(collection, index).value;
      const entityPath = "graph document " + collectionPath + "[" + index + "]";
      if (!isRecord(entity)) {
        errors.push(entityPath + " must be an object");
        continue;
      }
      const idState = propertyState(entity, "id");
      if (idState.present && !idState.safe) {
        errors.push(entityPath + ".id must be an own enumerable data property when present");
      }
      const id = stableRecordId(entity);
      if (id === undefined) {
        if (requireIdsForPath) errors.push(entityPath + ".id must be a non-empty string");
      } else {
        const previous = seenIds.get(id);
        if (previous) errors.push(entityPath + ".id duplicates " + id + " (already in " + previous + ")");
        else seenIds.set(id, entityPath);
        if (collectionPath === "nodes") nodeIds.add(id);
      }
      if (requireEntityMetadata || hasRecordMetadata(entity)) {
        errors.push(...validateGraphMetadata(entity, entityPath, {
          requireParentRevision: requireEntityMetadata,
        }));
      }
      errors.push(...customValidatorErrors(options.entityValidator, entity, index, entityPath));
    }
  }

  if (Array.isArray(nodesState.value)) {
    const nodes = nodesState.value;
    for (let index = 0; index < nodes.length; index += 1) {
      if (!hasOwnEnumerableDataProperty(nodes, index)) continue;
      const node = propertyState(nodes, index).value;
      const nodeId = stableRecordId(node);
      if (nodeId !== undefined) nodeIds.add(nodeId);
      errors.push(...customValidatorErrors(options.nodeValidator, node, index, "graph document nodes[" + index + "]"));
    }
  }
  if (requireEntityIds || declaredEntityPathSet.size > 0) {
    // Keep the explicit flag meaningful for callers using a custom entity path
    // that is not present in the default loop above.
    for (const collectionPath of entityPaths) {
      const requireIdsForPath = requireEntityIds || declaredEntityPathSet.has(collectionPath);
      if (!requireIdsForPath) continue;
      const collectionState = pathState(value, collectionPath);
      if (!collectionState.safe || !Array.isArray(collectionState.value)) continue;
      const collection = collectionState.value;
      for (let index = 0; index < collection.length; index += 1) {
        if (!hasOwnEnumerableDataProperty(collection, index)) continue;
        const entity = propertyState(collection, index).value;
        if (stableRecordId(entity) === undefined) {
          errors.push("graph document " + collectionPath + "[" + index + "].id must be a non-empty string");
        }
      }
    }
  }

  const explicitRules = options.typedEdgeDescriptors ?? [];
  const explicitPaths = new Set<string>();
  for (const rule of explicitRules) {
    const collectionPath = rule.collectionPath ?? rule.path ?? "edges";
    explicitPaths.add(collectionPath);
    const collection = valueAtPath(value, collectionPath);
    if (!Array.isArray(collection)) {
      errors.push("graph document " + collectionPath + " must be an array for typed edge validation");
      continue;
    }
    const selector = rule.endpointSelector ?? rule.getEndpoints;
    errors.push(...validateTypedEdgeDescriptors(
      collection as readonly TypedEdge[],
      nodeIds,
      selector,
      "graph document " + collectionPath,
    ));
  }

  const edgePath = options.edgeCollectionPath ?? "edges";
  const edgeCollection = valueAtPath(value, edgePath);
  if (Array.isArray(edgeCollection) && !explicitPaths.has(edgePath)) {
    // `from`/`to` are not a generic graph meaning.  Endpoint validation is
    // opt-in: the caller must provide the typed descriptor rule (above) or an
    // explicit selector for this collection.  This keeps arbitrary edge-like
    // records semantic-neutral until their owning layer supplies the rule.
    if (options.edgeEndpointSelector !== undefined) {
      errors.push(...validateTypedEdgeDescriptors(
        edgeCollection,
        nodeIds,
        options.edgeEndpointSelector,
        "graph document " + edgePath,
      ));
    }
  }

  // Relaxed legacy mode only relaxes explicitly missing metadata fields.  The
  // value still has to be lossless JSON so undefined/unsupported extension
  // facts cannot disappear during canonical serialization.
  errors.push(...validateStrictJsonPersistability(value, "graph document"));
  const uniqueErrors = [...new Set(errors)];
  return uniqueErrors.length > 0
    ? { ok: false, errors: uniqueErrors }
    : { ok: true, value: value as unknown as GraphCoreDocument, errors: [] };
}

export function serializeGraphDocument<T extends GraphCoreDocument, TypedEdge = never>(
  graph: T,
  options: {
    validation?: GraphDocumentValidationOptions<TypedEdge>;
    canonical?: CanonicalSerializationOptions;
  } = {},
): string {
  const result = validateGraphDocument(graph, options.validation);
  assertValidGraph(result);
  return canonicalStringify(graph, options.canonical);
}

export function parseGraphDocument<T extends GraphCoreDocument = GraphCoreDocument, TypedEdge = never>(
  text: string,
  options?: GraphDocumentValidationOptions<TypedEdge>,
): T {
  const parsed = parseGraphJson(text);
  const result = validateGraphDocument(parsed, options);
  return assertValidGraph(result) as T;
}

export const parseGraph = parseGraphDocument;

export interface GraphFingerprintOptions extends Sha256TestOptions, CanonicalSerializationOptions {}

export async function fingerprintGraph(
  value: unknown,
  options?: GraphFingerprintOptions,
): Promise<string> {
  return sha256Hex(canonicalStringify(value, options), options);
}

export const canonicalFingerprint = fingerprintGraph;

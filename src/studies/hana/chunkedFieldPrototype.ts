import type { HanaBounds3, HanaMaterialObject } from "./materialObjects.ts";

export const HANA_CHUNKED_FIELD_FORMAT = "katachi.hana-chunked-field-prototype.v0" as const;

export interface HanaChunkCoordinate {
  x: number;
  y: number;
  z: number;
}

export interface HanaChunkCache {
  sampleCount: number;
  sourceRevision: number;
  generation: number;
  boundarySignature: string;
}

export interface HanaFieldChunk {
  key: string;
  coordinate: HanaChunkCoordinate;
  objectIds: string[];
  dirty: boolean;
  generation: number;
  cache: HanaChunkCache | null;
}

export interface HanaChunkedFieldPrototype {
  format: typeof HANA_CHUNKED_FIELD_FORMAT;
  chunkSize: number;
  chunks: HanaFieldChunk[];
  objectToChunkKeys: Record<string, string[]>;
  objectBounds: Record<string, HanaBounds3>;
  dirtyChunkKeys: string[];
  revision: number;
}

export interface HanaChunkBoundaryValidationResult {
  valid: boolean;
  issues: string[];
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function cloneVector(value: { x: number; y: number; z: number }) {
  return { x: value.x, y: value.y, z: value.z };
}

function cloneBounds(value: HanaBounds3): HanaBounds3 {
  return { min: cloneVector(value.min), max: cloneVector(value.max) };
}

function cloneChunk(chunk: HanaFieldChunk): HanaFieldChunk {
  return {
    ...chunk,
    coordinate: { ...chunk.coordinate },
    objectIds: [...chunk.objectIds],
    cache: chunk.cache ? { ...chunk.cache } : null,
  };
}

function clonePrototype(prototype: HanaChunkedFieldPrototype): HanaChunkedFieldPrototype {
  return {
    ...prototype,
    chunks: prototype.chunks.map(cloneChunk),
    objectToChunkKeys: Object.fromEntries(Object.entries(prototype.objectToChunkKeys).map(([id, keys]) => [id, [...keys]])),
    objectBounds: Object.fromEntries(Object.entries(prototype.objectBounds).map(([id, bounds]) => [id, cloneBounds(bounds)])),
    dirtyChunkKeys: [...prototype.dirtyChunkKeys],
  };
}

export function chunkCoordinateForPosition(
  position: { x: number; y: number; z: number },
  chunkSize: number,
): HanaChunkCoordinate {
  const size = finitePositive(chunkSize, 1);
  return {
    x: Math.floor(position.x / size),
    y: Math.floor(position.y / size),
    z: Math.floor(position.z / size),
  };
}

export function chunkKey(coordinate: HanaChunkCoordinate): string {
  return `${coordinate.x},${coordinate.y},${coordinate.z}`;
}

export function chunkKeysForBounds(
  bounds: HanaBounds3,
  chunkSize: number,
): string[] {
  const size = finitePositive(chunkSize, 1);
  const minimum = chunkCoordinateForPosition({
    x: Math.min(bounds.min.x, bounds.max.x),
    y: Math.min(bounds.min.y, bounds.max.y),
    z: Math.min(bounds.min.z, bounds.max.z),
  }, size);
  const maximum = chunkCoordinateForPosition({
    x: Math.max(bounds.min.x, bounds.max.x),
    y: Math.max(bounds.min.y, bounds.max.y),
    z: Math.max(bounds.min.z, bounds.max.z),
  }, size);
  const keys: string[] = [];
  for (let x = minimum.x; x <= maximum.x; x += 1) {
    for (let y = minimum.y; y <= maximum.y; y += 1) {
      for (let z = minimum.z; z <= maximum.z; z += 1) keys.push(chunkKey({ x, y, z }));
    }
  }
  return keys;
}

function parseChunkKey(key: string): HanaChunkCoordinate | null {
  const values = key.split(",").map(Number);
  return values.length === 3 && values.every(Number.isInteger)
    ? { x: values[0], y: values[1], z: values[2] }
    : null;
}

function newChunk(key: string): HanaFieldChunk {
  const coordinate = parseChunkKey(key);
  if (!coordinate) throw new Error(`Invalid chunk key: ${key}`);
  return { key, coordinate, objectIds: [], dirty: true, generation: 0, cache: null };
}

export function createChunkedFieldPrototype(chunkSize = 1): HanaChunkedFieldPrototype {
  return {
    format: HANA_CHUNKED_FIELD_FORMAT,
    chunkSize: finitePositive(chunkSize, 1),
    chunks: [],
    objectToChunkKeys: {},
    objectBounds: {},
    dirtyChunkKeys: [],
    revision: 0,
  };
}

export function indexMaterialObjectInChunks(
  prototype: HanaChunkedFieldPrototype,
  object: HanaMaterialObject,
): HanaChunkedFieldPrototype {
  const next = clonePrototype(prototype);
  const oldKeys = next.objectToChunkKeys[object.id] ?? [];
  for (const key of oldKeys) {
    const chunk = next.chunks.find((candidate) => candidate.key === key);
    if (!chunk) continue;
    chunk.objectIds = chunk.objectIds.filter((id) => id !== object.id);
    chunk.dirty = true;
    chunk.cache = null;
    if (!next.dirtyChunkKeys.includes(key)) next.dirtyChunkKeys.push(key);
  }
  const keys = chunkKeysForBounds(object.bounds, next.chunkSize);
  for (const key of keys) {
    let chunk = next.chunks.find((candidate) => candidate.key === key);
    if (!chunk) {
      chunk = newChunk(key);
      next.chunks.push(chunk);
    }
    if (!chunk.objectIds.includes(object.id)) chunk.objectIds.push(object.id);
    chunk.objectIds.sort();
    chunk.dirty = true;
    chunk.cache = null;
    if (!next.dirtyChunkKeys.includes(key)) next.dirtyChunkKeys.push(key);
  }
  next.objectToChunkKeys[object.id] = [...keys];
  next.objectBounds[object.id] = cloneBounds(object.bounds);
  next.dirtyChunkKeys.sort();
  next.revision += 1;
  return next;
}

export function removeMaterialObjectFromChunks(
  prototype: HanaChunkedFieldPrototype,
  objectId: string,
): HanaChunkedFieldPrototype {
  const next = clonePrototype(prototype);
  const keys = next.objectToChunkKeys[objectId] ?? [];
  for (const key of keys) {
    const chunk = next.chunks.find((candidate) => candidate.key === key);
    if (!chunk) continue;
    chunk.objectIds = chunk.objectIds.filter((id) => id !== objectId);
    chunk.dirty = true;
    chunk.cache = null;
    if (!next.dirtyChunkKeys.includes(key)) next.dirtyChunkKeys.push(key);
  }
  delete next.objectToChunkKeys[objectId];
  delete next.objectBounds[objectId];
  next.revision += 1;
  return next;
}

export function regenerateDirtyChunks(
  prototype: HanaChunkedFieldPrototype,
  sampleCountByObject: Readonly<Record<string, number>> = {},
): HanaChunkedFieldPrototype {
  const next = clonePrototype(prototype);
  for (const key of next.dirtyChunkKeys) {
    const chunk = next.chunks.find((candidate) => candidate.key === key);
    if (!chunk) continue;
    const sampleCount = chunk.objectIds.reduce((total, objectId) => total + Math.max(0, sampleCountByObject[objectId] ?? 0), 0);
    const sourceRevision = chunk.objectIds.reduce((total, objectId) => total + (next.objectBounds[objectId] ? 1 : 0), 0);
    const generation = chunk.generation + 1;
    chunk.cache = {
      sampleCount,
      sourceRevision,
      generation,
      boundarySignature: `${key}|${chunk.objectIds.join(",")}|${sampleCount}`,
    };
    chunk.generation = generation;
    chunk.dirty = false;
  }
  next.dirtyChunkKeys = [];
  next.revision += 1;
  return next;
}

export function validateChunkBoundaryConsistency(
  prototype: HanaChunkedFieldPrototype,
): HanaChunkBoundaryValidationResult {
  const issues: string[] = [];
  const chunks = new Map(prototype.chunks.map((chunk) => [chunk.key, chunk]));
  for (const [objectId, bounds] of Object.entries(prototype.objectBounds)) {
    const expected = chunkKeysForBounds(bounds, prototype.chunkSize).sort();
    const actual = [...(prototype.objectToChunkKeys[objectId] ?? [])].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) issues.push(`object index boundary mismatch: ${objectId}`);
    for (const key of actual) {
      if (!chunks.get(key)?.objectIds.includes(objectId)) issues.push(`chunk reverse index missing: ${objectId} → ${key}`);
    }
  }
  for (const chunk of prototype.chunks) {
    for (const objectId of chunk.objectIds) {
      if (!(prototype.objectToChunkKeys[objectId] ?? []).includes(chunk.key)) issues.push(`orphan chunk membership: ${chunk.key} → ${objectId}`);
    }
  }
  return { valid: issues.length === 0, issues };
}

export function serializeChunkedFieldPrototype(prototype: HanaChunkedFieldPrototype): string {
  return JSON.stringify(clonePrototype(prototype), null, 2);
}

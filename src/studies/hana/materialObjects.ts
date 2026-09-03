import type { HanaMaterialSample } from "./materialField.ts";
import type { HanaVector3 } from "./stroke3d.ts";

export const HANA_MATERIAL_OBJECT_KINDS = ["stroke", "flower", "connector", "core"] as const;
export type HanaMaterialObjectKind = typeof HANA_MATERIAL_OBJECT_KINDS[number];

export interface HanaBounds3 {
  min: HanaVector3;
  max: HanaVector3;
}

export interface HanaMaterialObjectMeshCache {
  triangleCount: number;
  generationId: number;
}

export interface HanaMaterialObject {
  id: string;
  kind: HanaMaterialObjectKind;
  sourceIds: string[];
  revision: number;
  bounds: HanaBounds3;
  materialSamples: HanaMaterialSample[];
  dirty: boolean;
  sourceRevision: number;
  generationId: number;
  localKdTree: { sampleCount: number; builtForRevision: number };
  meshCache: HanaMaterialObjectMeshCache | null;
}

export interface HanaObjectGeneration {
  objectId: string;
  generationId: number;
}

function cloneVector(value: HanaVector3): HanaVector3 {
  return { x: value.x, y: value.y, z: value.z };
}

function cloneBounds(bounds: HanaBounds3): HanaBounds3 {
  return { min: cloneVector(bounds.min), max: cloneVector(bounds.max) };
}

function cloneSample(sample: HanaMaterialSample): HanaMaterialSample {
  return {
    ...sample,
    position: cloneVector(sample.position),
  };
}

export function boundsForMaterialSamples(samples: readonly HanaMaterialSample[]): HanaBounds3 {
  if (samples.length === 0) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  const min = cloneVector(samples[0].position);
  const max = cloneVector(samples[0].position);
  for (const sample of samples.slice(1)) {
    min.x = Math.min(min.x, sample.position.x);
    min.y = Math.min(min.y, sample.position.y);
    min.z = Math.min(min.z, sample.position.z);
    max.x = Math.max(max.x, sample.position.x);
    max.y = Math.max(max.y, sample.position.y);
    max.z = Math.max(max.z, sample.position.z);
  }
  return { min, max };
}

export function createMaterialObject(
  id: string,
  kind: HanaMaterialObjectKind,
  sourceIds: readonly string[],
  materialSamples: readonly HanaMaterialSample[],
  sourceRevision = 0,
): HanaMaterialObject {
  return {
    id,
    kind,
    sourceIds: [...sourceIds],
    revision: 0,
    bounds: boundsForMaterialSamples(materialSamples),
    materialSamples: materialSamples.map(cloneSample),
    dirty: true,
    sourceRevision,
    generationId: 0,
    localKdTree: { sampleCount: materialSamples.length, builtForRevision: -1 },
    meshCache: null,
  };
}

export function cloneMaterialObject(object: HanaMaterialObject): HanaMaterialObject {
  return {
    ...object,
    sourceIds: [...object.sourceIds],
    bounds: cloneBounds(object.bounds),
    materialSamples: object.materialSamples.map(cloneSample),
    localKdTree: { ...object.localKdTree },
    meshCache: object.meshCache ? { ...object.meshCache } : null,
  };
}

export function replaceMaterialObjectSamples(
  object: HanaMaterialObject,
  materialSamples: readonly HanaMaterialSample[],
  sourceRevision: number,
): HanaMaterialObject {
  const next = cloneMaterialObject(object);
  next.revision += 1;
  next.sourceRevision = sourceRevision;
  next.bounds = boundsForMaterialSamples(materialSamples);
  next.materialSamples = materialSamples.map(cloneSample);
  next.localKdTree = { sampleCount: materialSamples.length, builtForRevision: -1 };
  next.meshCache = null;
  next.dirty = true;
  return next;
}

export function markMaterialObjectClean(
  object: HanaMaterialObject,
  generationId: number,
  triangleCount: number,
): HanaMaterialObject {
  const next = cloneMaterialObject(object);
  next.dirty = false;
  next.generationId = generationId;
  next.localKdTree = { sampleCount: next.materialSamples.length, builtForRevision: next.revision };
  next.meshCache = { triangleCount, generationId };
  return next;
}

function distanceSquaredToBounds(position: HanaVector3, bounds: HanaBounds3): number {
  const axisDistance = (value: number, min: number, max: number): number => (
    value < min ? min - value : value > max ? value - max : 0
  );
  const dx = axisDistance(position.x, bounds.min.x, bounds.max.x);
  const dy = axisDistance(position.y, bounds.min.y, bounds.max.y);
  const dz = axisDistance(position.z, bounds.min.z, bounds.max.z);
  return dx * dx + dy * dy + dz * dz;
}

/** Local candidate query boundary; a future KD-tree can replace the scan without changing its contract. */
export function localCandidateSampleIndices(
  object: HanaMaterialObject,
  position: HanaVector3,
  influenceRadius: number,
): number[] {
  const radius = Math.max(0, Number.isFinite(influenceRadius) ? influenceRadius : 0);
  if (distanceSquaredToBounds(position, object.bounds) > radius * radius) return [];
  return object.materialSamples
    .map((sample, index) => ({ sample, index }))
    .filter(({ sample }) => Math.hypot(
      sample.position.x - position.x,
      sample.position.y - position.y,
      sample.position.z - position.z,
    ) <= radius)
    .map(({ index }) => index);
}

/** Object-scoped invalidation and generation lifecycle. It never accumulates old objects. */
export class HanaMaterialObjectRegistry {
  private readonly objects = new Map<string, HanaMaterialObject>();
  private readonly latestGenerations = new Map<string, number>();

  get size(): number {
    return this.objects.size;
  }

  get(objectId: string): HanaMaterialObject | null {
    const object = this.objects.get(objectId);
    return object ? cloneMaterialObject(object) : null;
  }

  values(): HanaMaterialObject[] {
    return [...this.objects.values()].map(cloneMaterialObject);
  }

  upsert(object: HanaMaterialObject): void {
    this.objects.set(object.id, cloneMaterialObject(object));
  }

  upsertStrokeObject(
    objectId: string,
    materialSamples: readonly HanaMaterialSample[],
    sourceRevision: number,
  ): HanaMaterialObject {
    const current = this.objects.get(objectId);
    const next = current
      ? replaceMaterialObjectSamples(current, materialSamples, sourceRevision)
      : createMaterialObject(objectId, "stroke", [objectId], materialSamples, sourceRevision);
    this.upsert(next);
    return cloneMaterialObject(next);
  }

  markDirty(objectIds: readonly string[]): void {
    for (const objectId of objectIds) {
      const object = this.objects.get(objectId);
      if (!object) continue;
      object.dirty = true;
      object.meshCache = null;
      this.objects.set(objectId, object);
    }
  }

  dirtyObjectIds(): string[] {
    return [...this.objects.values()].filter((object) => object.dirty).map((object) => object.id);
  }

  beginGeneration(objectId: string): HanaObjectGeneration {
    const nextId = (this.latestGenerations.get(objectId) ?? 0) + 1;
    this.latestGenerations.set(objectId, nextId);
    const object = this.objects.get(objectId);
    if (object) {
      object.generationId = nextId;
      object.dirty = true;
      this.objects.set(objectId, object);
    }
    return { objectId, generationId: nextId };
  }

  isCurrentGeneration(generation: HanaObjectGeneration): boolean {
    return this.latestGenerations.get(generation.objectId) === generation.generationId;
  }

  applyGeneration(generation: HanaObjectGeneration, triangleCount: number): HanaMaterialObject | null {
    if (!this.isCurrentGeneration(generation)) return null;
    const object = this.objects.get(generation.objectId);
    if (!object) return null;
    const clean = markMaterialObjectClean(object, generation.generationId, triangleCount);
    this.upsert(clean);
    return cloneMaterialObject(clean);
  }
}

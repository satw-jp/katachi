export interface HanaRemoteObjectDependency {
  objectId: string;
  /** Object ids whose changes this object consumes. */
  dependsOn: readonly string[];
}

export interface HanaRemoteObjectDirtySet {
  directDirty: string[];
  dependentDirty: string[];
  clean: string[];
}

function stableOrder(ids: readonly string[], selected: Set<string>): string[] {
  return ids.filter((id, index) => selected.has(id) && ids.indexOf(id) === index);
}

/**
 * Resolve only the objects affected by direct edits. Dependencies point from
 * a derived object to the source objects it consumes, so the reverse graph is
 * walked from each directly edited object.
 */
export function deriveHanaRemoteObjectDirtySet(
  objectIds: readonly string[],
  dependencies: readonly HanaRemoteObjectDependency[],
  directObjectIds: readonly string[],
): HanaRemoteObjectDirtySet {
  const available = new Set(objectIds);
  const direct = new Set(directObjectIds.filter((id) => available.has(id)));
  const dependents = new Map<string, string[]>();
  for (const dependency of dependencies) {
    if (!available.has(dependency.objectId)) continue;
    for (const sourceId of dependency.dependsOn) {
      if (!available.has(sourceId)) continue;
      const list = dependents.get(sourceId) ?? [];
      if (!list.includes(dependency.objectId)) list.push(dependency.objectId);
      dependents.set(sourceId, list);
    }
  }

  const affected = new Set(direct);
  const queue = [...direct];
  while (queue.length > 0) {
    const sourceId = queue.shift()!;
    for (const dependentId of dependents.get(sourceId) ?? []) {
      if (affected.has(dependentId)) continue;
      affected.add(dependentId);
      queue.push(dependentId);
    }
  }

  const dependent = new Set([...affected].filter((id) => !direct.has(id)));
  return {
    directDirty: stableOrder(objectIds, direct),
    dependentDirty: stableOrder(objectIds, dependent),
    clean: stableOrder(objectIds, new Set([...available].filter((id) => !affected.has(id)))),
  };
}


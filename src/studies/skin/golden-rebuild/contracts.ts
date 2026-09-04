import { canonicalStringify } from "../graphCore.ts";
import { sha256HexSync } from "../../../lib/hash.ts";

export type ArtifactStatus = "current" | "partial" | "stale" | "unavailable";

export interface ArtifactProvenance {
  readonly source: string;
  readonly sourceFingerprint?: string;
  readonly upstream?: readonly string[];
  readonly algorithmVersion?: string;
}

export interface DerivedArtifact<T> {
  readonly data: T | null;
  readonly status: ArtifactStatus;
  readonly role: string;
  readonly provenance: ArtifactProvenance;
  readonly generatedAt?: number;
  readonly fingerprint?: string;
}

export interface RegisteredArtifact<T> extends DerivedArtifact<T> {
  readonly id: string;
}

export interface GraphSummary {
  readonly nodeCount: number;
  readonly edgeCount: number;
}

export interface GraphArtifact<T, TGraph = GraphSummary> extends RegisteredArtifact<T> {
  readonly graph: TGraph | null;
  readonly editable: boolean;
}

export interface ArtifactRegistry<T extends RegisteredArtifact<unknown>> {
  get(id: string): T | null;
  has(id: string): boolean;
  list(): readonly T[];
}

export function fingerprintValue(label: string, value: unknown): string {
  return sha256HexSync(`${label}\n${canonicalStringify(value)}`);
}

function cloneAndFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const clone = value.map((item) => cloneAndFreeze(item));
    return Object.freeze(clone) as T;
  }
  const clone: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    clone[key] = cloneAndFreeze(item);
  }
  return Object.freeze(clone) as T;
}

function normalizeProvenance(input: ArtifactProvenance): ArtifactProvenance {
  return {
    source: input.source,
    ...(input.sourceFingerprint === undefined ? {} : { sourceFingerprint: input.sourceFingerprint }),
    ...(input.upstream === undefined ? {} : { upstream: [...input.upstream] }),
    ...(input.algorithmVersion === undefined ? {} : { algorithmVersion: input.algorithmVersion }),
  };
}

export function createDerivedArtifact<T>(input: {
  data: T | null;
  status: ArtifactStatus;
  role: string;
  provenance: ArtifactProvenance;
  generatedAt?: number;
  fingerprint?: string;
}): DerivedArtifact<T> {
  const data = input.data === null ? null : cloneAndFreeze(input.data);
  const provenance = cloneAndFreeze(normalizeProvenance(input.provenance));
  const fingerprint = input.fingerprint ?? fingerprintValue("derived-artifact", {
    data,
    role: input.role,
    provenance,
  });
  return Object.freeze({
    data,
    status: input.status,
    role: input.role,
    provenance,
    generatedAt: input.generatedAt,
    fingerprint,
  });
}

export function createRegisteredArtifact<T>(input: {
  id: string;
  data: T | null;
  status: ArtifactStatus;
  role: string;
  provenance: ArtifactProvenance;
  generatedAt?: number;
  fingerprint?: string;
}): RegisteredArtifact<T> {
  const artifact = createDerivedArtifact(input);
  return Object.freeze({ id: input.id, ...artifact });
}

export function createGraphArtifact<T, TGraph = GraphSummary>(input: {
  id: string;
  data: T | null;
  graph: TGraph | null;
  status: ArtifactStatus;
  role: string;
  provenance: ArtifactProvenance;
  editable?: boolean;
}): GraphArtifact<T, TGraph> {
  const data = input.data === null ? null : cloneAndFreeze(input.data);
  const graph = input.graph === null ? null : cloneAndFreeze(input.graph);
  const provenance = normalizeProvenance(input.provenance);
  const artifact = createDerivedArtifact({
    data,
    status: input.status,
    role: input.role,
    provenance,
    fingerprint: fingerprintValue("graph-artifact", {
      id: input.id,
      data,
      graph,
      role: input.role,
      provenance,
    }),
  });
  return Object.freeze({
    id: input.id,
    ...artifact,
    graph,
    editable: input.editable ?? false,
  });
}

export function createArtifactRegistry<T extends RegisteredArtifact<unknown>>(
  artifacts: readonly T[],
): ArtifactRegistry<T> {
  const ids = new Set<string>();
  const ordered = artifacts.map((artifact) => {
    if (!artifact.id || ids.has(artifact.id)) throw new Error(`duplicate artifact id: ${artifact.id}`);
    ids.add(artifact.id);
    return artifact;
  });
  const frozen = Object.freeze(ordered);
  const byId = new Map(frozen.map((artifact) => [artifact.id, artifact]));
  return Object.freeze({
    get: (id: string) => byId.get(id) ?? null,
    has: (id: string) => byId.has(id),
    list: () => frozen,
  });
}

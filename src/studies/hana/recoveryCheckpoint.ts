import {
  cloneHanaAuthoringDocument,
  migrateHanaDocument,
  type HanaAuthoringDocument,
} from "./authoringDocument.ts";
import { cloneHanaFlower, type HanaFlower } from "./flowerAuthoring.ts";
import { cloneAuthoringGraph, type HanaAuthoringGraph } from "./authoringGraph.ts";

export const HANA_RECOVERY_CHECKPOINT_FORMAT = "katachi.hana-recovery-checkpoint.v0" as const;
export const HANA_RECOVERY_SCHEMA_VERSION = 1 as const;
export const HANA_RECOVERY_ALGORITHM_VERSION = "hana-authoring-stack-v0" as const;
export const HANA_RECOVERY_DATABASE_NAME = "katachi-hana-recovery-v0" as const;
export const HANA_RECOVERY_STORE_NAME = "checkpoints" as const;

export interface HanaRecoveryCheckpoint {
  format: typeof HANA_RECOVERY_CHECKPOINT_FORMAT;
  schemaVersion: typeof HANA_RECOVERY_SCHEMA_VERSION;
  documentId: string;
  documentRevision: number;
  savedAt: string;
  strokeRevision: number;
  algorithmVersion: typeof HANA_RECOVERY_ALGORITHM_VERSION;
  document: HanaAuthoringDocument;
  /** Optional semantic extension; absent in legacy document-only checkpoints. */
  flowers?: HanaFlower[];
  activeFlowerId?: string | null;
  /** Optional semantic Graph extension; absent in legacy checkpoints. */
  graph?: HanaAuthoringGraph;
}

export interface HanaRecoveryValidation {
  valid: boolean;
  issues: string[];
}

export interface HanaRecoveryStore {
  save(checkpoint: HanaRecoveryCheckpoint): Promise<void>;
  load(documentId: string): Promise<HanaRecoveryCheckpoint | null>;
  clear(documentId: string): Promise<void>;
}

function finiteInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function cloneCheckpoint(checkpoint: HanaRecoveryCheckpoint): HanaRecoveryCheckpoint {
  return {
    ...checkpoint,
    document: cloneHanaAuthoringDocument(checkpoint.document),
    flowers: checkpoint.flowers?.map(cloneHanaFlower),
    graph: checkpoint.graph ? cloneAuthoringGraph(checkpoint.graph) : undefined,
  };
}

export function createHanaRecoveryCheckpoint(
  document: HanaAuthoringDocument,
  options: { savedAt?: string; algorithmVersion?: string; flowers?: readonly HanaFlower[]; activeFlowerId?: string | null; graph?: HanaAuthoringGraph } = {},
): HanaRecoveryCheckpoint {
  return {
    format: HANA_RECOVERY_CHECKPOINT_FORMAT,
    schemaVersion: HANA_RECOVERY_SCHEMA_VERSION,
    documentId: document.documentId,
    documentRevision: finiteInteger(document.revision),
    savedAt: options.savedAt ?? new Date().toISOString(),
    strokeRevision: document.strokes.reduce((maximum, stroke) => Math.max(maximum, finiteInteger(stroke.revision)), 0),
    algorithmVersion: (options.algorithmVersion ?? HANA_RECOVERY_ALGORITHM_VERSION) as typeof HANA_RECOVERY_ALGORITHM_VERSION,
    document: cloneHanaAuthoringDocument(document),
    flowers: options.flowers?.map(cloneHanaFlower),
    activeFlowerId: options.activeFlowerId ?? null,
    graph: options.graph ? cloneAuthoringGraph(options.graph) : undefined,
  };
}

export function validateHanaRecoveryCheckpoint(value: unknown): HanaRecoveryValidation {
  const issues: string[] = [];
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  if (source.format !== HANA_RECOVERY_CHECKPOINT_FORMAT) issues.push("unsupported format");
  if (source.schemaVersion !== HANA_RECOVERY_SCHEMA_VERSION) issues.push("unsupported schema version");
  if (typeof source.documentId !== "string" || source.documentId.length === 0) issues.push("document id is required");
  if (!Number.isInteger(source.documentRevision) || Number(source.documentRevision) < 0) issues.push("document revision is invalid");
  if (typeof source.savedAt !== "string" || !Number.isFinite(Date.parse(source.savedAt))) issues.push("saved timestamp is invalid");
  if (source.algorithmVersion !== HANA_RECOVERY_ALGORITHM_VERSION) issues.push("algorithm version is incompatible");
  const documentSource = source.document;
  if (!documentSource || typeof documentSource !== "object" || Array.isArray(documentSource)) {
    issues.push("document is required");
  } else {
    try {
      const document = migrateHanaDocument(documentSource);
      if (document.documentId !== source.documentId) issues.push("document identity mismatch");
      if (document.revision !== Number(source.documentRevision)) issues.push("document revision mismatch");
    } catch {
      issues.push("document is invalid");
    }
  }
  return { valid: issues.length === 0, issues };
}

export function parseHanaRecoveryCheckpoint(value: unknown): HanaRecoveryCheckpoint {
  const validation = validateHanaRecoveryCheckpoint(value);
  if (!validation.valid) throw new Error(`Invalid HANA recovery checkpoint: ${validation.issues.join(", ")}`);
  const source = value as Record<string, unknown>;
  return {
    format: HANA_RECOVERY_CHECKPOINT_FORMAT,
    schemaVersion: HANA_RECOVERY_SCHEMA_VERSION,
    documentId: source.documentId as string,
    documentRevision: finiteInteger(source.documentRevision),
    savedAt: source.savedAt as string,
    strokeRevision: finiteInteger(source.strokeRevision),
    algorithmVersion: HANA_RECOVERY_ALGORITHM_VERSION,
    document: migrateHanaDocument(source.document),
    flowers: Array.isArray(source.flowers)
      ? source.flowers.map((flower) => flower as HanaFlower).map(cloneHanaFlower)
      : undefined,
    activeFlowerId: typeof source.activeFlowerId === "string" ? source.activeFlowerId : null,
    graph: source.graph && typeof source.graph === "object" && !Array.isArray(source.graph)
      ? cloneAuthoringGraph(source.graph as HanaAuthoringGraph)
      : undefined,
  };
}

export function isNewerHanaRecoveryCheckpoint(
  checkpoint: HanaRecoveryCheckpoint,
  currentDocumentId: string,
  currentRevision: number,
): boolean {
  return checkpoint.documentId === currentDocumentId
    && checkpoint.documentRevision >= Math.max(0, Math.trunc(currentRevision));
}

export function createMemoryHanaRecoveryStore(): HanaRecoveryStore {
  const values = new Map<string, HanaRecoveryCheckpoint>();
  return {
    async save(checkpoint) {
      values.set(checkpoint.documentId, cloneCheckpoint(checkpoint));
    },
    async load(documentId) {
      const checkpoint = values.get(documentId);
      return checkpoint ? cloneCheckpoint(checkpoint) : null;
    },
    async clear(documentId) {
      values.delete(documentId);
    },
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

/** IndexedDB-backed recovery storage. It falls back to memory when IndexedDB is unavailable. */
export function createIndexedDbHanaRecoveryStore(
  factory: IDBFactory | undefined = typeof indexedDB === "undefined" ? undefined : indexedDB,
): HanaRecoveryStore {
  if (!factory) return createMemoryHanaRecoveryStore();
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(HANA_RECOVERY_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANA_RECOVERY_STORE_NAME)) {
        request.result.createObjectStore(HANA_RECOVERY_STORE_NAME, { keyPath: "documentId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
  return {
    async save(checkpoint) {
      const db = await database;
      const transaction = db.transaction(HANA_RECOVERY_STORE_NAME, "readwrite");
      transaction.objectStore(HANA_RECOVERY_STORE_NAME).put(cloneCheckpoint(checkpoint));
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB save failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB save aborted"));
      });
    },
    async load(documentId) {
      const db = await database;
      const value = await requestResult(db.transaction(HANA_RECOVERY_STORE_NAME, "readonly")
        .objectStore(HANA_RECOVERY_STORE_NAME).get(documentId));
      if (!value) return null;
      try {
        return parseHanaRecoveryCheckpoint(value);
      } catch {
        return null;
      }
    },
    async clear(documentId) {
      const db = await database;
      const transaction = db.transaction(HANA_RECOVERY_STORE_NAME, "readwrite");
      transaction.objectStore(HANA_RECOVERY_STORE_NAME).delete(documentId);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB clear failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB clear aborted"));
      });
    },
  };
}

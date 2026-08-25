import { sha256Hex } from "../../lib/hash.ts";
import { validateOverhangAssignmentLedger, type OverhangSupportPolicyResult } from "./overhangSupportPolicy.ts";
import type {
  SurfaceAngleDiagnosisBuildRequest,
  SurfaceAngleWorkerMessage,
} from "./surfaceAngleWorkerProtocol.ts";

const DATABASE_NAME = "katachi-skin-surface-angle-cache-v1";
const DATABASE_VERSION = 2;
const LEGACY_STORE_NAME = "surface-angle-results";
const MESH_STORE_NAME = "surface-mesh-v2";
const DIAGNOSIS_STORE_NAME = "surface-diagnosis-v2";
const LEGACY_SCHEMA = "katachi.skin.surface-angle-cache.v1";
export const SURFACE_MESH_CACHE_SCHEMA = "katachi.skin.surface-mesh-cache.v2";
export const SURFACE_DIAGNOSIS_CACHE_SCHEMA = "katachi.skin.surface-diagnosis-cache.v2";
export const SURFACE_GENERATION_ALGORITHM_VERSION = "support-free-skin-surface-parallel-v1";

export type SurfaceAngleResult = Extract<SurfaceAngleWorkerMessage, { type: "result" }>;
export interface SurfaceDiagnosisCacheValue {
  result: SurfaceAngleResult;
  automaticResult: OverhangSupportPolicyResult;
}

export interface SurfaceMeshKeyComponents {
  stableShapeFingerprint: string;
  resolution: number;
  surfaceGenerationAlgorithmVersion: string;
}

export interface SurfaceDiagnosisKeyComponents {
  surfaceMeshKey: string;
  targetLongestMm: number;
  angleThresholdDeg: number;
  supportClassificationPolicyVersion: string;
  rayEpsilonVersion: string;
}

export interface SurfacePersistentCacheKeys {
  meshKey: string;
  diagnosisKey: string;
  meshComponents: SurfaceMeshKeyComponents;
  diagnosisComponents: SurfaceDiagnosisKeyComponents;
}

export interface SurfaceMeshCacheValue {
  basePositions: Float32Array;
  baseNormals: Float32Array;
  baseFaceCount: number;
  resolution: number;
}

interface StoredSurfaceMesh {
  schema: typeof SURFACE_MESH_CACHE_SCHEMA;
  key: string;
  savedAt: string;
  components: SurfaceMeshKeyComponents;
  mesh: SurfaceMeshCacheValue;
}

interface StoredSurfaceDiagnosis {
  schema: typeof SURFACE_DIAGNOSIS_CACHE_SCHEMA;
  key: string;
  savedAt: string;
  components: SurfaceDiagnosisKeyComponents;
  result: SurfaceAngleResult;
  automaticResult: OverhangSupportPolicyResult;
}

interface StoredLegacySurfaceAngleResult {
  schema: typeof LEGACY_SCHEMA;
  key: string;
  savedAt: string;
  result: SurfaceAngleResult;
}

export interface SurfaceCacheComponentDifference {
  component: string;
  current: unknown;
  saved: unknown;
}

export interface SurfaceCacheMissReport {
  currentMeshKey: string;
  currentDiagnosisKey: string;
  savedMeshKeys: string[];
  savedDiagnosisKeys: string[];
  nearestMeshKey: string | null;
  meshDifferences: SurfaceCacheComponentDifference[];
  nearestDiagnosisKey: string | null;
  diagnosisDifferences: SurfaceCacheComponentDifference[];
}

export interface SurfacePersistentCacheLookup {
  mesh: SurfaceMeshCacheValue | null;
  diagnosis: SurfaceDiagnosisCacheValue | null;
  unclassifiedDiagnosis: SurfaceAngleResult | null;
  miss: SurfaceCacheMissReport;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LEGACY_STORE_NAME)) database.createObjectStore(LEGACY_STORE_NAME);
      if (!database.objectStoreNames.contains(MESH_STORE_NAME)) database.createObjectStore(MESH_STORE_NAME);
      if (!database.objectStoreNames.contains(DIAGNOSIS_STORE_NAME)) database.createObjectStore(DIAGNOSIS_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Surface cache database open failed"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Surface cache request failed"));
  });
}

function validMesh(value: unknown): value is SurfaceMeshCacheValue {
  if (!value || typeof value !== "object") return false;
  const mesh = value as Partial<SurfaceMeshCacheValue>;
  return mesh.basePositions instanceof Float32Array
    && mesh.baseNormals instanceof Float32Array
    && mesh.basePositions.length > 0
    && mesh.basePositions.length === mesh.baseNormals.length
    && mesh.basePositions.length % 9 === 0
    && Number.isInteger(mesh.baseFaceCount)
    && mesh.baseFaceCount! > 0
    && Number.isInteger(mesh.resolution)
    && mesh.resolution! > 0;
}

function validResult(value: unknown): value is SurfaceAngleResult {
  if (!value || typeof value !== "object") return false;
  if (!validMesh(value)) return false;
  const result = value as unknown as Partial<SurfaceAngleResult>;
  return result.type === "result"
    && result.beforeDangerPositions instanceof Float32Array
    && result.afterDangerPositions instanceof Float32Array
    && result.mitigatedPositions instanceof Float32Array;
}

function validAutomaticResult(value: unknown): value is OverhangSupportPolicyResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<OverhangSupportPolicyResult>;
  if (!(result.outsideFacePositionsMm instanceof Float32Array)
    || !(result.diagnosedFacePositionsMm instanceof Float32Array)
    || !Array.isArray(result.entries)
    || !result.counts) return false;
  try {
    const summarized = validateOverhangAssignmentLedger(result as OverhangSupportPolicyResult);
    for (const key of Object.keys(summarized) as Array<keyof typeof summarized>) {
      if (result.counts[key] !== summarized[key]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function canonicalShapeInput(request: SurfaceAngleDiagnosisBuildRequest): unknown {
  return {
    host: request.host,
    hostK: request.hostK,
    thickness: request.thickness,
    patches: request.patches,
    roundK: request.roundK,
    coinBulge: request.coinBulge,
    coinBulgeBalance: request.coinBulgeBalance,
    quadMeshJoinWidth: request.quadMeshJoinWidth,
    mode: request.mode,
  };
}

export async function buildStableSurfaceShapeFingerprint(
  request: SurfaceAngleDiagnosisBuildRequest,
): Promise<string> {
  return "shape:" + await sha256Hex(JSON.stringify(canonicalShapeInput(request)));
}

export async function buildSurfacePersistentCacheKeys(
  request: SurfaceAngleDiagnosisBuildRequest,
  versions: { supportClassificationPolicyVersion: string; rayEpsilonVersion: string },
): Promise<SurfacePersistentCacheKeys> {
  const meshComponents: SurfaceMeshKeyComponents = {
    stableShapeFingerprint: await buildStableSurfaceShapeFingerprint(request),
    resolution: request.resolution,
    surfaceGenerationAlgorithmVersion: SURFACE_GENERATION_ALGORITHM_VERSION,
  };
  const meshKey = "surface-mesh:" + await sha256Hex(JSON.stringify({ schema: SURFACE_MESH_CACHE_SCHEMA, ...meshComponents }));
  const diagnosisComponents: SurfaceDiagnosisKeyComponents = {
    surfaceMeshKey: meshKey,
    targetLongestMm: request.targetLongestMm,
    angleThresholdDeg: request.thresholdDeg,
    supportClassificationPolicyVersion: versions.supportClassificationPolicyVersion,
    rayEpsilonVersion: versions.rayEpsilonVersion,
  };
  const diagnosisKey = "surface-diagnosis:" + await sha256Hex(JSON.stringify({ schema: SURFACE_DIAGNOSIS_CACHE_SCHEMA, ...diagnosisComponents }));
  return { meshKey, diagnosisKey, meshComponents, diagnosisComponents };
}

export function compareSurfaceCacheComponents(
  current: Record<string, unknown>,
  saved: Record<string, unknown>,
): SurfaceCacheComponentDifference[] {
  return [...new Set([...Object.keys(current), ...Object.keys(saved)])]
    .filter((component) => JSON.stringify(current[component]) !== JSON.stringify(saved[component]))
    .map((component) => ({ component, current: current[component], saved: saved[component] }));
}

function nearestRecord<T extends { key: string; components: object }>(
  current: Record<string, unknown>,
  records: readonly T[],
): { record: T | null; differences: SurfaceCacheComponentDifference[] } {
  let best: T | null = null;
  let differences: SurfaceCacheComponentDifference[] = [];
  for (const record of records) {
    const next = compareSurfaceCacheComponents(current, record.components as Record<string, unknown>);
    if (!best || next.length < differences.length) { best = record; differences = next; }
  }
  return { record: best, differences };
}

export async function readSurfacePersistentCache(
  keys: SurfacePersistentCacheKeys,
  generation: number,
): Promise<SurfacePersistentCacheLookup> {
  const database = await openDatabase();
  try {
    const exactTransaction = database.transaction([MESH_STORE_NAME, DIAGNOSIS_STORE_NAME], "readonly");
    const exactMeshStore = exactTransaction.objectStore(MESH_STORE_NAME);
    const exactDiagnosisStore = exactTransaction.objectStore(DIAGNOSIS_STORE_NAME);
    const [storedMesh, storedDiagnosis] = await Promise.all([
      requestResult(exactMeshStore.get(keys.meshKey)) as Promise<StoredSurfaceMesh | undefined>,
      requestResult(exactDiagnosisStore.get(keys.diagnosisKey)) as Promise<StoredSurfaceDiagnosis | undefined>,
    ]);
    const mesh = storedMesh?.schema === SURFACE_MESH_CACHE_SCHEMA && storedMesh.key === keys.meshKey && validMesh(storedMesh.mesh)
      ? storedMesh.mesh : null;
    const unclassifiedDiagnosis = storedDiagnosis?.schema === SURFACE_DIAGNOSIS_CACHE_SCHEMA
      && storedDiagnosis.key === keys.diagnosisKey && validResult(storedDiagnosis.result)
      ? { ...storedDiagnosis.result, generation } : null;
    const diagnosis = storedDiagnosis?.schema === SURFACE_DIAGNOSIS_CACHE_SCHEMA
      && storedDiagnosis.key === keys.diagnosisKey
      && validResult(storedDiagnosis.result)
      && validAutomaticResult(storedDiagnosis.automaticResult)
      ? { result: { ...storedDiagnosis.result, generation }, automaticResult: storedDiagnosis.automaticResult }
      : null;
    if (mesh && diagnosis) {
      return {
        mesh, diagnosis, unclassifiedDiagnosis: null,
        miss: {
          currentMeshKey: keys.meshKey, currentDiagnosisKey: keys.diagnosisKey,
          savedMeshKeys: [keys.meshKey], savedDiagnosisKeys: [keys.diagnosisKey],
          nearestMeshKey: keys.meshKey, meshDifferences: [],
          nearestDiagnosisKey: keys.diagnosisKey, diagnosisDifferences: [],
        },
      };
    }

    const diagnosticTransaction = database.transaction([MESH_STORE_NAME, DIAGNOSIS_STORE_NAME], "readonly");
    const [meshRecords, diagnosisRecords] = await Promise.all([
      requestResult(diagnosticTransaction.objectStore(MESH_STORE_NAME).getAll()) as Promise<StoredSurfaceMesh[]>,
      requestResult(diagnosticTransaction.objectStore(DIAGNOSIS_STORE_NAME).getAll()) as Promise<StoredSurfaceDiagnosis[]>,
    ]);
    const validMeshes = meshRecords.filter((record) => record.schema === SURFACE_MESH_CACHE_SCHEMA && validMesh(record.mesh));
    const validDiagnoses = diagnosisRecords.filter((record) => record.schema === SURFACE_DIAGNOSIS_CACHE_SCHEMA
      && validResult(record.result) && validAutomaticResult(record.automaticResult));
    const nearestMesh = nearestRecord(keys.meshComponents as unknown as Record<string, unknown>, validMeshes);
    const nearestDiagnosis = nearestRecord(keys.diagnosisComponents as unknown as Record<string, unknown>, validDiagnoses);
    return {
      mesh, diagnosis, unclassifiedDiagnosis,
      miss: {
        currentMeshKey: keys.meshKey, currentDiagnosisKey: keys.diagnosisKey,
        savedMeshKeys: validMeshes.map((record) => record.key),
        savedDiagnosisKeys: validDiagnoses.map((record) => record.key),
        nearestMeshKey: nearestMesh.record?.key ?? null, meshDifferences: nearestMesh.differences,
        nearestDiagnosisKey: nearestDiagnosis.record?.key ?? null, diagnosisDifferences: nearestDiagnosis.differences,
      },
    };
  } finally {
    database.close();
  }
}

export async function writeSurfacePersistentCache(
  keys: SurfacePersistentCacheKeys,
  result: SurfaceAngleResult,
  automaticResult: OverhangSupportPolicyResult,
): Promise<void> {
  if (!validResult(result)) throw new Error("Surface cache refuses an invalid result");
  if (!validAutomaticResult(automaticResult)) throw new Error("Surface cache refuses an invalid automatic support ledger");
  const savedAt = new Date().toISOString();
  const mesh: SurfaceMeshCacheValue = {
    basePositions: result.basePositions,
    baseNormals: result.baseNormals,
    baseFaceCount: result.baseFaceCount,
    resolution: result.resolution,
  };
  const database = await openDatabase();
  try {
    const transaction = database.transaction([MESH_STORE_NAME, DIAGNOSIS_STORE_NAME], "readwrite");
    transaction.objectStore(MESH_STORE_NAME).put({
      schema: SURFACE_MESH_CACHE_SCHEMA, key: keys.meshKey, savedAt, components: keys.meshComponents, mesh,
    } satisfies StoredSurfaceMesh, keys.meshKey);
    transaction.objectStore(DIAGNOSIS_STORE_NAME).put({
      schema: SURFACE_DIAGNOSIS_CACHE_SCHEMA, key: keys.diagnosisKey, savedAt, components: keys.diagnosisComponents, result, automaticResult,
    } satisfies StoredSurfaceDiagnosis, keys.diagnosisKey);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Surface cache write failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Surface cache write aborted"));
    });
  } finally {
    database.close();
  }
}

async function legacyKey(request: SurfaceAngleDiagnosisBuildRequest, generatorCommit: string): Promise<string> {
  const canonical = JSON.stringify({
    schema: LEGACY_SCHEMA, generatorCommit,
    host: request.host, hostK: request.hostK, thickness: request.thickness, patches: request.patches,
    internalGraph: request.internalGraph, roundK: request.roundK, coinBulge: request.coinBulge,
    coinBulgeBalance: request.coinBulgeBalance, quadMeshJoinWidth: request.quadMeshJoinWidth,
    mode: request.mode, thresholdDeg: request.thresholdDeg, resolution: request.resolution,
    targetLongestMm: request.targetLongestMm,
  });
  return "surface-angle:" + await sha256Hex(canonical);
}

/** Reads only exact v1 request matches (with current graph or support-free null graph).
 * generatorCommit remains a legacy lookup detail and never enters either v2 key. */
export async function readLegacySurfacePersistentCache(
  request: SurfaceAngleDiagnosisBuildRequest,
  generatorCommit: string,
  generation: number,
): Promise<{ key: string; result: SurfaceAngleResult } | null> {
  const candidates = [request, { ...request, internalGraph: null }];
  const keys = [...new Set(await Promise.all(candidates.map((candidate) => legacyKey(candidate, generatorCommit))))];
  const database = await openDatabase();
  try {
    const transaction = database.transaction(LEGACY_STORE_NAME, "readonly");
    const store = transaction.objectStore(LEGACY_STORE_NAME);
    const records = await Promise.all(keys.map((key) => requestResult(store.get(key)) as Promise<StoredLegacySurfaceAngleResult | undefined>));
    const valid = records.filter((record): record is StoredLegacySurfaceAngleResult => Boolean(
      record && record.schema === LEGACY_SCHEMA && keys.includes(record.key) && validResult(record.result),
    )).sort((left, right) => right.savedAt.localeCompare(left.savedAt));
    const found = valid[0];
    return found ? { key: found.key, result: { ...found.result, generation } } : null;
  } finally {
    database.close();
  }
}

/** A hit makes invoking the corresponding Worker factory impossible. */
export function createSurfaceWorkerOnCacheMiss<T>(cached: unknown | null, createWorker: () => T): T | null {
  return cached === null ? createWorker() : null;
}

export function createAutomaticSupportClassificationWorkerOnCacheMiss<T>(
  cachedLedger: OverhangSupportPolicyResult | null,
  createWorker: () => T,
): T | null {
  return cachedLedger === null ? createWorker() : null;
}
